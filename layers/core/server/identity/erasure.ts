// Erasure (ID-16; part 3, "Export and erasure"), built from the registry: every table that holds rows
// about the person has them deleted or its personal columns cleared, as each column declared.
// Erasure is anonymisation: sales, attendance and safety records stay as rows about nobody, and the
// account stays as a tombstone.
//
// It runs in stages, each its own unit of work, so it never outgrows core.units.statement-limit
// however many modules hold personal data. Stage 0 locks the account (it cannot sign in, its
// sessions and live grants end); then each module's erasure handler gets a stage; then the plan's
// steps, a share per stage, children before parents; and the last stage erases the person's
// addresses and the account itself, checks that nothing the plan reaches is left, and unlocks the
// tombstone. To the person it is all or nothing: locked out from the first stage, a tombstone after
// the last. Every statement only touches what is still there to erase, so any stage, or the whole
// run, can be repeated and do no harm; a second run on a tombstone writes nothing.
import { endPractice } from '../practice/session'
import { all, createUnit, first, nowMs, usePoint, useSetting, type UnitView } from '#kit'
import { useRegistry } from '#kit/registry'
import { ERASED, type TableMeta } from '#kit/db'
import { accountScopeSql } from '#kit/accounts'
import type { ErasureHandler } from '../points/erasure-handler'
import type { ErasureHold } from '../points/erasure-hold'
import { accountById, verifiedAddressesOf } from './accounts'
import { guardLastOwner, isOwner, LIVE } from './grants'
import { endSessionsOf } from './sessions'

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
export function bound(sql: string, params: unknown[]): { sql: string, params: unknown[] } {
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
export function matchOf(meta: TableMeta, tables: Map<string, TableMeta>, depth = 0): string | null {
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
      .filter(c => c.meta.class === 'internal' ? c.meta.erase === 'clear' : (c.meta.erase === 'clear' || c.meta.erase === 'anonymise' || c.meta.erase === 'redact'))
      .map(c => ({ column: c.sql, to: c.meta.erase as 'clear' | 'anonymise' | 'redact' }))
    if (meta.options.onErasure === 'delete-row') steps.push({ table: meta.name, match, action: 'delete', set: [] })
    else if (set.length || meta.name === 'core_accounts') steps.push({ table: meta.name, match, action: 'update', set })
  }
  // Rows reached through parents go first, the deepest first (a ticket before its order line before
  // its order), so a step never loses the parent rows a later step finds its rows by; the account last.
  const depth = (meta: TableMeta | undefined, seen = 0): number => {
    const subject = meta?.options.subject
    if (!meta || seen > 4 || !subject || typeof subject !== 'object' || !('via' in subject)) return 0 // not-policy: a guard against a cycle
    const via = Object.values(meta.columns).find(c => c.sql === subject.via)
    return 1 + depth(via?.meta.ref ? tables.get(via.meta.ref.table) : undefined, seen + 1)
  }
  const rank = (s: ErasureStep) => s.table === 'core_accounts' ? -1 : depth(tables.get(s.table))
  return steps.sort((a, b) => rank(b) - rank(a))
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

/** Statements a stage keeps free for its own bookkeeping: its check, the next stage, the audit. */
const RESERVE = 10 // not-policy: headroom inside core.units.statement-limit

/**
 * Tables the last stage erases: the person's addresses, which every earlier stage finds rows by
 * (?2), and the account, which every stage finds itself by.
 */
const LAST = new Set(['core_account_emails', 'core_accounts'])

/** How often the last stage sends the run round again for rows written while it ran. */
const PASSES = 3 // not-policy: a guard against a loop

/** The marker on an account while it is being erased: disabled, so it cannot sign in. */
export const ERASING = 'erasing'

interface Stages { handlers: ErasureHandler[], shares: ErasureStep[][], last: ErasureStep[], plan: ErasureStep[] }

async function stages(): Promise<Stages> {
  const plan = erasurePlan()
  const limit = await useSetting('core.units.statement-limit') as number
  const size = Math.max(1, limit - RESERVE)
  const middle = plan.filter(s => !LAST.has(s.table))
  const shares: ErasureStep[][] = []
  for (let i = 0; i < middle.length; i += size) shares.push(middle.slice(i, i + size))
  const handlers = (await usePoint<ErasureHandler>('core.erasure-handler')).map(h => h.value)
  return { handlers, shares, last: plan.filter(s => LAST.has(s.table)), plan }
}

/** The statement for one step. */
function statementOf(step: ErasureStep, params: unknown[]): { sql: string, params: unknown[] } {
  if (step.action === 'delete') return bound(`DELETE FROM ${q(step.table)} WHERE ${step.match}`, params)
  const set = step.set.map(c => `${q(c.column)} = ${VALUE[c.to]}`)
  if (step.table === 'core_accounts') {
    set.push('audience_email_id = NULL', 'members_email_id = NULL', 'anonymised_at = ?3')
    // The lock comes off: a tombstone is out of use by being one.
    set.push(`disabled_at = CASE WHEN disabled_reason = '${ERASING}' THEN NULL ELSE disabled_at END`, `disabled_reason = CASE WHEN disabled_reason = '${ERASING}' THEN NULL ELSE disabled_reason END`)
  }
  return bound(`UPDATE ${q(step.table)} SET ${set.join(', ')} WHERE (${step.match})${step.table === 'core_accounts' ? ' AND anonymised_at IS NULL' : ''}`, params)
}

/** SQL that is true while none of `steps` has anything left to erase. */
function noneLeft(steps: ErasureStep[]): string {
  return steps.filter(s => s.table !== 'core_accounts' && (s.action === 'delete' || s.set.length)).map(s =>
    s.action === 'delete'
      ? `NOT EXISTS (SELECT 1 FROM ${q(s.table)} WHERE ${s.match})`
      : `NOT EXISTS (SELECT 1 FROM ${q(s.table)} WHERE (${s.match}) AND (${s.set.map(leftOver).join(' OR ')}))`).join(' AND ') || '1'
}

const INCOMPLETE = { code: 'core.erasure.incomplete', reason: 'The erasure did not clear everything, so nothing was changed.', remedy: 'Report this; the request will be tried again.' }

/** Where a run goes next: a stage, and which pass through the stages it is on. */
export interface ErasureNext { stage: number, pass: number }

/** What one stage did: the next stage to run, or, after the last, the address the account wrote to. */
export type ErasureStageResult = { next: ErasureNext } | { next: null, erased: { address: string | null } | null }

/** Whether the account's erasure has started: it carries the lock. */
export async function erasureStarted(accountId: string): Promise<boolean> {
  return !!(await first('SELECT 1 FROM core_accounts WHERE id = ? AND disabled_reason = ? AND anonymised_at IS NULL', accountId, ERASING))
}

/**
 * Runs one stage of an account's erasure in the caller's unit. Holds are the caller's to check
 * before stage 0; the last-Owner rule is asserted here as well. `erased` is null when there was
 * nothing to erase (already a tombstone).
 */
export async function eraseStage(unit: UnitView, accountId: string, stage: number, pass = 0): Promise<ErasureStageResult> {
  const account = await accountById(accountId)
  if (!account || account.anonymised_at) return { next: null, erased: null }
  const { handlers, shares, last, plan } = await stages()
  const at = nowMs()
  const emails = await verifiedAddressesOf(accountId)
  const params = [accountId, JSON.stringify(emails), at]
  const next = { next: { stage: stage + 1, pass } }

  if (stage === 0) {
    // The lock: no new session, and the ones open end. Live grants end, as history: core_grants is
    // append-only and keeps who held what.
    unit.add({ sql: 'UPDATE core_accounts SET disabled_at = coalesce(disabled_at, ?), disabled_reason = ? WHERE id = ? AND anonymised_at IS NULL', params: [at, ERASING, accountId] }).expect(1, INCOMPLETE)
    endSessionsOf(unit, accountId, 'erased')
    // A practice store holds the person's name: it is gone before erasure reports done (Practice mode, S9).
    await endPractice(accountId, 'erased')
    unit.add(bound(`INSERT INTO core_grant_ends (grant_id, ended_at, ended_by, ended_reason) SELECT g.id, ?3, NULL, 'account_closed' FROM core_grants g WHERE g.account_id ${SCOPE} AND ${LIVE.replaceAll('?', '?3')}`, params))
    if (await isOwner(accountId)) guardLastOwner(unit)
    return next
  }
  if (stage <= handlers.length) {
    await handlers[stage - 1]!.erase(unit, { accountId, emails })
    return next
  }
  const share = shares[stage - 1 - handlers.length]
  if (share) {
    for (const step of share) unit.add(statementOf(step, params))
    // Each share checks itself, so a fault shows in the stage that has it.
    unit.add(bound(`UPDATE core_accounts SET id = id WHERE id = ?1 AND ${noneLeft(share)}`, params)).expect(1, INCOMPLETE)
    return next
  }

  // The last stage. Rows written about the person while the run went on send it round again.
  const middle = plan.filter(s => !LAST.has(s.table))
  const check = bound(`SELECT ${noneLeft(middle)} AS clear`, params)
  if (pass + 1 < PASSES && !(await first<{ clear: number }>(check.sql, ...check.params))?.clear) return { next: { stage: 1, pass: pass + 1 } }
  const audience = account.audience_email_id ? (await all<{ address: string }>('SELECT address FROM core_account_emails WHERE id = ? AND verified_at IS NOT NULL', account.audience_email_id))[0]?.address ?? null : null
  for (const step of last) unit.add(statementOf(step, params))
  // The run checks itself: nothing it should have removed is still there, or the tombstone is not made.
  unit.add(bound(`UPDATE core_accounts SET anonymised_at = anonymised_at WHERE id = ?1 AND anonymised_at IS NOT NULL AND ${noneLeft(plan)}`, params)).expect(1, INCOMPLETE)
  unit.announce('core.account.erased', { accountId }, { record: ['core.account', accountId] })
  unit.audit({ action: 'erase', record: ['core.account', accountId], detail: { tables: plan.length, stages: stage + 1 } })
  return { next: null, erased: { address: audience } }
}

/**
 * Erases an account now, every stage in its own unit, one after another. For callers outside a
 * data request, such as tests; a request runs its stages as jobs (core.run-erasure).
 */
export async function eraseAccount(accountId: string): Promise<{ address: string | null } | null> {
  let at: ErasureNext = { stage: 0, pass: 0 }
  for (;;) {
    const unit = createUnit()
    const result = await eraseStage(unit.view(), accountId, at.stage, at.pass)
    await unit.commit()
    if (!result.next) return result.erased
    at = result.next
  }
}
