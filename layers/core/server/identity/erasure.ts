// Erasure (ID-16; part 3, "Export and erasure"). One batch, built from the registry: every table
// that holds rows about the person has them deleted or its personal columns cleared, as each column
// declared. Erasure is anonymisation: sales, attendance and safety records stay as rows about nobody,
// and the account stays as a tombstone. The batch asserts its own completeness, and a second run on
// a tombstone writes nothing.
import { all, nowMs, usePoint, type UnitView } from '#kit'
import { useRegistry } from '#kit/registry'
import { ERASED, type TableMeta } from '#kit/db'
import { accountScopeSql } from '#kit/accounts'
import type { ErasureHandler } from '../points/erasure-handler'
import type { ErasureHold } from '../points/erasure-hold'
import { accountById, verifiedAddressesOf } from './accounts'
import { guardLastOwner, isOwner, LIVE } from './grants'

/** What erasure does to one table's rows about the person. */
export interface ErasureStep {
  table: string
  /** SQL that picks the person's rows: ?1 is the account id, ?2 a JSON list of their verified addresses. */
  match: string
  action: 'delete' | 'update'
  set: { column: string, to: 'clear' | 'anonymise' | 'redact' }[]
}

const q = (name: string) => `"${name}"`

/** D1 wants exactly as many values as the statement numbers, so each gets the first n it uses. */
function bound(sql: string, params: unknown[]): { sql: string, params: unknown[] } {
  const highest = Math.max(0, ...[...sql.matchAll(/\?(\d)/g)].map(m => Number(m[1])))
  return { sql, params: params.slice(0, highest) }
}

/**
 * The person's rows by an account column: the account scope, so rows written under an account
 * merged into this one are reached too (the column may be alias, or a move the merge job has not
 * reached yet).
 */
const SCOPE = `IN (${accountScopeSql('?1')})`

/** The conditions that pick a table's rows about the person, or null if none can be picked. */
function matchOf(meta: TableMeta, tables: Map<string, TableMeta>, depth = 0): string | null {
  const subject = meta.options.subject
  if (subject === 'none') return null
  const terms: string[] = []
  if (typeof subject === 'string') terms.push(`${q(subject)} ${SCOPE}`)
  else if (Array.isArray(subject)) terms.push(...subject.map(c => `${q(c)} ${SCOPE}`))
  else if (subject && 'email' in subject) terms.push(`${q(subject.email)} IN (SELECT value FROM json_each(?2))`)
  else if (subject && 'via' in subject) {
    const via = Object.values(meta.columns).find(c => c.sql === subject.via)
    const parent = via?.meta.ref ? tables.get(via.meta.ref.table) : undefined
    const parentMatch = parent && depth < 4 ? matchOf(parent, tables, depth + 1) : null // not-policy: a guard against a cycle
    if (parentMatch) terms.push(`${q(subject.via)} IN (SELECT id FROM ${q(parent!.name)} WHERE ${parentMatch})`)
  }
  terms.push(...meta.subjects.filter(c => !terms.some(t => t.startsWith(`${q(c)} `))).map(c => `${q(c)} ${SCOPE}`))
  // A table about no one in particular still holds what the person did there, under their own
  // name: the audit trail's actor name, the reason they gave for a setting.
  if (!subject && !meta.subjects.length) {
    for (const c of Object.values(meta.columns)) if (c.meta.account?.role === 'actor') terms.push(`${q(c.sql)} ${SCOPE}`)
  }
  return terms.length ? terms.map(t => `(${t})`).join(' OR ') : null
}

/** The plan for every table in the registry, children reached through a parent first, the account last. */
export function erasurePlan(): ErasureStep[] {
  const tables = new Map<string, TableMeta>()
  for (const [name, { meta }] of useRegistry().tables as Map<string, { meta: TableMeta }>) tables.set(name, meta)
  const steps: ErasureStep[] = []
  for (const meta of tables.values()) {
    const match = matchOf(meta, tables)
    if (!match) continue
    const set = Object.values(meta.columns)
      .filter(c => c.meta.class !== 'internal' && (c.meta.erase === 'clear' || c.meta.erase === 'anonymise' || c.meta.erase === 'redact'))
      .map(c => ({ column: c.sql, to: c.meta.erase as 'clear' | 'anonymise' | 'redact' }))
    if (meta.options.onErasure === 'delete-row') steps.push({ table: meta.name, match, action: 'delete', set: [] })
    else if (set.length || meta.name === 'core_accounts') steps.push({ table: meta.name, match, action: 'update', set })
  }
  const rank = (s: ErasureStep) => s.table === 'core_accounts' ? 2 : tables.get(s.table)?.options.subject && typeof tables.get(s.table)!.options.subject === 'object' && 'via' in (tables.get(s.table)!.options.subject as object) ? 0 : 1
  return steps.sort((a, b) => rank(a) - rank(b))
}

const VALUE: Record<ErasureStep['set'][number]['to'], string> = {
  clear: 'NULL',
  anonymise: `'${ERASED.anonymise}'`,
  redact: `'${ERASED.redact}'`,
}

/** True of a column that still holds something the batch should have removed. */
const leftOver = (c: ErasureStep['set'][number]) => c.to === 'clear' ? `${q(c.column)} IS NOT NULL` : `(${q(c.column)} IS NOT NULL AND ${q(c.column)} IS NOT ${VALUE[c.to]})`

/** Every module's hold codes for this account; none means it may run. */
export async function erasureHolds(accountId: string): Promise<string[]> {
  const codes: string[] = []
  for (const { value } of await usePoint<ErasureHold>('core.erasure-hold')) codes.push(...await value.holds(accountId))
  return [...new Set(codes)].sort()
}

/**
 * Erases an account in the caller's unit. Returns the address the account wrote to, so the caller
 * can tell it once after the commit, or null when there was nothing to erase (already a tombstone).
 * Holds are the caller's to check first; the last-Owner rule is asserted here as well.
 */
export async function eraseAccount(unit: UnitView, accountId: string): Promise<{ address: string | null } | null> {
  const account = await accountById(accountId)
  if (!account || account.anonymised_at) return null
  const at = nowMs()
  const emails = await verifiedAddressesOf(accountId)
  const audience = account.audience_email_id ? (await all<{ address: string }>('SELECT address FROM core_account_emails WHERE id = ? AND verified_at IS NOT NULL', account.audience_email_id))[0]?.address ?? null : null
  const owner = await isOwner(accountId)
  const params = [accountId, JSON.stringify(emails), at]
  // Live grants end, as history: core_grants is append-only and keeps who held what.
  unit.add(bound(`INSERT INTO core_grant_ends (grant_id, ended_at, ended_by, ended_reason) SELECT g.id, ?3, NULL, 'account_closed' FROM core_grants g WHERE g.account_id = ?1 AND ${LIVE.replaceAll('?', '?3')}`, params))
  for (const handler of await usePoint<ErasureHandler>('core.erasure-handler')) await handler.value.erase(unit, { accountId, emails })
  const plan = erasurePlan()
  for (const step of plan) {
    if (step.action === 'delete') {
      unit.add(bound(`DELETE FROM ${q(step.table)} WHERE ${step.match}`, params))
      continue
    }
    const set = step.set.map(c => `${q(c.column)} = ${VALUE[c.to]}`)
    if (step.table === 'core_accounts') set.push('audience_email_id = NULL', 'members_email_id = NULL', 'anonymised_at = ?3')
    unit.add(bound(`UPDATE ${q(step.table)} SET ${set.join(', ')} WHERE (${step.match})${step.table === 'core_accounts' ? ' AND anonymised_at IS NULL' : ''}`, params))
  }
  // The batch checks itself: nothing it should have removed is still there, or nothing commits.
  const remaining = plan.filter(s => s.table !== 'core_accounts' && (s.action === 'delete' || s.set.length)).map(s =>
    s.action === 'delete'
      ? `NOT EXISTS (SELECT 1 FROM ${q(s.table)} WHERE ${s.match})`
      : `NOT EXISTS (SELECT 1 FROM ${q(s.table)} WHERE (${s.match}) AND (${s.set.map(leftOver).join(' OR ')}))`)
  unit.add(bound(`UPDATE core_accounts SET anonymised_at = anonymised_at WHERE id = ?1 AND anonymised_at IS NOT NULL AND ${remaining.join(' AND ') || '1'}`, params))
    .expect(1, { code: 'core.erasure.incomplete', reason: 'The erasure did not clear everything, so nothing was changed.', remedy: 'Report this; the request will be tried again.' })
  if (owner) guardLastOwner(unit)
  unit.announce('core.account.erased', { accountId }, { record: ['core.account', accountId] })
  unit.audit({ action: 'erase', record: ['core.account', accountId], detail: { tables: plan.length } })
  return { address: audience }
}
