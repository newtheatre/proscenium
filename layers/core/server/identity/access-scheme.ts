// The access scheme (ID-38 to ID-44; part 3, "The access scheme"). A person applies once with the
// barriers they face and the companions they need; a reviewer accepts, rejects or asks for more; an
// accepted application can be marked verified in person. What it says may reveal health, so it is
// sealed in special columns, never listed or searched, and read by a module only for a purpose the
// person has switched on, through accessNeedsFor, which audits every read and answers nothing,
// the same way, whatever the reason.
import type { H3Event } from 'h3'
import { all, can, first, isEnabled, newId, nowMs, openSpecial, refuse, sealSpecial, usePoint, useSetting, type Actor, type UnitView } from '#kit'
import { notify } from '../notifications/notify'
import { notifyAddress } from '../notifications/send'
import { getTerm, listTerms } from '../vocabularies/service'
import { accountById, isUsable, normaliseAddress } from './accounts'
import { digest, randomToken } from './crypto'
import { findOrCreateAccount } from './guests'
import { relyingParty } from './web'
import { holdersOf } from './holders'
import { hasStanding } from './standings'
import { z } from 'zod'
import { DERIVED, WHEELCHAIR } from '../../shared/access-scheme'
import type { VERIFIED_METHODS } from '../db/identity'

export const NEEDS_VOCABULARY = 'core.access-need'
export const MAX_NOTE = 200 // not-policy: the specification's bound on a note
export const MAX_OTHER = 1000 // not-policy: room for "anything else", with no diagnosis asked for
export type VerifiedMethod = typeof VERIFIED_METHODS[number]

/** The application form's input, the same whether the person sends it or staff send it for them. */
export const applicationInput = z.object({
  needs: z.array(z.object({ term: z.string().max(40), note: z.string().max(MAX_NOTE).optional() }).strict()).max(40), // not-policy: an id is short, and the list is short
  companions: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  other: z.string().max(MAX_OTHER).optional(),
}).strict()

/** What a person says: ticks against core.access-need (by term id), notes, companions, anything else. */
export interface Application {
  needs: { term: string, note?: string }[]
  companions: 0 | 1 | 2
  other?: string
}

export interface ProfileRow {
  account_id: string
  status: 'submitted' | 'more-info' | 'accepted' | 'rejected'
  payload: string | null
  pending: string | null
  message: string | null
  submitted_at: number
  submitted_via: 'self' | 'staff'
  submitted_by: string | null
  decided_at: number | null
  decided_by: string | null
  verified_at: number | null
  verified_by: string | null
  verified_method: string | null
  verified_companions: number | null
  review_due: number | null
  reminders: number
  flagged_at: number | null
  updated_at: number
}

export interface Purpose {
  id: string
  side: 'audience' | 'members'
  label: string
  explanation: string
  ability?: string
  uses: 'all' | string[]
  note?: boolean
  on?: string
  agreedOnApplying?: boolean
}

const NOT_FOUND = (): never => refuse('core.not-found', 'There is no such page.', { status: 404 })

export async function schemeEnabled(): Promise<boolean> {
  return !!(await useSetting('core.access-scheme.enabled'))
}

export async function profileOf(accountId: string): Promise<ProfileRow | null> {
  return first<ProfileRow>('SELECT * FROM core_access_profiles WHERE account_id = ?', accountId)
}

const openApp = async (sealed: string | null): Promise<Application | null> => {
  const plain = await openSpecial(sealed)
  return plain ? JSON.parse(plain) as Application : null
}
const sealApp = (app: Application | null) => sealSpecial(app ? JSON.stringify(app) : null)

/** Companions the person may book now: nought while verification is required and missing. */
export function companionsInForce(row: ProfileRow, app: Application | null, needVerified: boolean): number {
  if (row.status !== 'accepted' || !app) return 0
  if (needVerified && !(row.verified_at && (row.verified_companions ?? 0) >= app.companions)) return 0
  return app.companions
}

/** Checks an application against the vocabulary and the settings, and returns it tidied. */
async function checked(input: Application): Promise<Application> {
  const allowNote = !!(await useSetting('core.access-scheme.allow-note'))
  const terms = await listTerms(NEEDS_VOCABULARY)
  const live = new Set(terms.map(t => t.id))
  const idOf = (slug: string) => terms.find(t => t.slug === slug)?.id
  const seen = new Set<string>()
  const needs: Application['needs'] = []
  for (const need of input.needs) {
    if (!live.has(need.term) || seen.has(need.term)) refuse('core.access.unknown-need', 'One of the needs ticked is not on the list.', { status: 422, fields: { needs: 'invalid' } })
    seen.add(need.term)
    const note = need.note?.trim()
    if (note && !allowNote) refuse('core.access.notes-off', 'Notes beside each need are not taken.', { status: 422, fields: { needs: 'invalid' } })
    if (note && note.length > MAX_NOTE) refuse('core.access.note-too-long', `A note can be at most ${MAX_NOTE} characters.`, { status: 422, fields: { needs: 'invalid' } })
    needs.push(note ? { term: need.term, note } : { term: need.term })
  }
  const stays = idOf(WHEELCHAIR.stays)
  const transfers = idOf(WHEELCHAIR.transfers)
  if (stays && transfers && seen.has(stays) && seen.has(transfers)) refuse('core.access.wheelchair-both', 'Choose whether you stay in your wheelchair or transfer to a seat, not both.', { status: 422, fields: { wheelchair: 'invalid' } })
  const other = input.other?.trim()
  if (other && other.length > MAX_OTHER) refuse('core.access.other-too-long', `This can be at most ${MAX_OTHER} characters.`, { status: 422, fields: { other: 'invalid' } })
  // The form asks about companions and "anything else" in its own words, not as ticks, so the
  // entries a purpose reads for them are added here. Nothing the person sent is taken away.
  for (const [slug, wanted] of [[DERIVED.companion, input.companions > 0], [DERIVED.other, !!other]] as const) {
    const id = idOf(slug)
    if (wanted && id && !seen.has(id)) {
      seen.add(id)
      needs.push({ term: id })
    }
  }
  if (!needs.length && !input.companions) refuse('core.access.empty', 'Tick at least one need, or ask for a companion.', { status: 422, fields: { needs: 'required' } })
  return { needs, companions: input.companions, ...(other ? { other } : {}) }
}

async function purposes(): Promise<{ module: string, value: Purpose }[]> {
  return (await usePoint<Purpose>('core.access-purpose')).map(c => ({ module: c.module, value: c.value }))
}

const schemeName = async () => String(await useSetting('core.access-scheme.name'))

/**
 * Applies, answers a request for more, or (when accepted) sends a change for review (ID-38, ID-40,
 * ID-44). What was accepted stays in force until a change is decided. Staff may apply on the
 * person's behalf; the person is told and can correct it (ID-42).
 */
export async function apply(unit: UnitView, actor: Actor, accountId: string, input: Application): Promise<{ status: ProfileRow['status'] }> {
  if (!(await schemeEnabled())) return NOT_FOUND()
  const account = await accountById(accountId)
  if (!isUsable(account)) refuse('core.not-found', 'There is no such person.', { status: 404 })
  const app = await checked(input)
  const at = nowMs()
  const byStaff = actor.accountId !== accountId
  const via = byStaff ? 'staff' : 'self'
  const existing = await profileOf(accountId)
  const sealed = await sealApp(app)
  if (!existing || existing.status === 'rejected') {
    if (existing) unit.add({ sql: 'DELETE FROM core_access_profiles WHERE account_id = ? AND status = \'rejected\'', params: [accountId] })
    unit.add({
      sql: 'INSERT INTO core_access_profiles (account_id, status, pending, submitted_at, submitted_via, submitted_by, updated_at) VALUES (?, \'submitted\', ?, ?, ?, ?, ?)',
      params: [accountId, sealed, at, via, byStaff ? actor.accountId! : null, at],
    })
    // Applying agrees to the purposes that say so (the box office's), as the form tells the person.
    for (const { value } of await purposes()) {
      if (value.agreedOnApplying) unit.add({ sql: 'INSERT OR IGNORE INTO core_access_shares (account_id, purpose, created_at) VALUES (?, ?, ?)', params: [accountId, value.id, at] })
    }
  }
  else if (existing.status === 'submitted' && !byStaff) {
    refuse('core.access.open', 'Your application is already with the theatre.', { status: 409, remedy: 'Wait for their answer; you can change it once it is decided.' })
  }
  else {
    // An answer to a request for more, a change to an accepted application, or staff correcting one.
    unit.add({
      sql: 'UPDATE core_access_profiles SET pending = ?, status = CASE WHEN status = \'more-info\' THEN \'submitted\' ELSE status END, submitted_at = ?, submitted_via = ?, submitted_by = ?, flagged_at = NULL, updated_at = ? WHERE account_id = ?',
      params: [sealed, at, via, byStaff ? actor.accountId! : null, at, accountId],
    })
  }
  unit.audit({ action: existing ? 'update' : 'create', ...(byStaff ? { ability: 'core.access-scheme.review' } : {}), record: ['core.account', accountId], detail: { accessApplication: via } })
  await notify(unit, 'core.access-application-received', { to: accountId, variables: { scheme: await schemeName() } })
  return { status: existing?.status === 'accepted' ? 'accepted' : 'submitted' }
}

export type Decision
  = | { action: 'accept', companions?: 0 | 1 | 2, message?: string }
    | { action: 'reject', message: string }
    | { action: 'ask', message: string }

/**
 * A reviewer's decision (ID-40). Accepting may grant fewer companions than asked, with a message.
 * Rejecting needs a message, and so does asking for more. A decision on a change to an accepted
 * application leaves what was accepted in force unless the change is accepted.
 */
export async function decide(unit: UnitView, actor: Actor, accountId: string, decision: Decision): Promise<void> {
  const row = await profileOf(accountId)
  if (!row?.pending) refuse('core.access.nothing-to-decide', 'There is nothing waiting for a decision.', { status: 409 })
  // An application staff entered is decided by another reviewer, when there is one (ID-42).
  if (row.submitted_via === 'staff' && row.submitted_by === actor.accountId) {
    const others = (await holdersOf('core.access-scheme.review', ['core.account', accountId])).filter(id => id !== actor.accountId && id !== accountId)
    if (others.length) refuse('core.access.entered-by-you', 'You entered this application, so another reviewer decides it.', { status: 403 })
  }
  const at = nowMs()
  const pending = (await openApp(row.pending))!
  const message = decision.message?.trim() || null
  if (decision.action !== 'accept' && !message) refuse('core.access.message-needed', 'Write a message to the person.', { status: 422, fields: { message: 'required' } })
  if (decision.action === 'accept') {
    const companions = Math.min(decision.companions ?? pending.companions, pending.companions) as 0 | 1 | 2
    if (companions < pending.companions && !message) refuse('core.access.message-needed', 'Say why fewer companions were accepted.', { status: 422, fields: { message: 'required' } })
    const inForce = { ...pending, companions }
    const reviewAfter = await useSetting('core.access-scheme.review-after') as number
    // A different number of companions needs seeing again before it counts as verified.
    const keepVerified = row.verified_at && row.verified_companions !== null && row.verified_companions >= companions
    unit.add({
      sql: `UPDATE core_access_profiles SET status = 'accepted', payload = ?, pending = NULL, message = ?, decided_at = ?, decided_by = ?, review_due = ?, reminders = 0, flagged_at = NULL,
              verified_at = ${keepVerified ? 'verified_at' : 'NULL'}, verified_by = ${keepVerified ? 'verified_by' : 'NULL'}, verified_method = ${keepVerified ? 'verified_method' : 'NULL'}, verified_companions = ${keepVerified ? 'verified_companions' : 'NULL'}, updated_at = ?
            WHERE account_id = ?`,
      params: [await sealApp(inForce), await sealSpecial(message), at, actor.accountId!, at + reviewAfter * 1000, at, accountId], // not-policy: seconds to milliseconds
    }).expect(1)
  }
  else if (row.status === 'accepted') {
    // A change refused or questioned: what was accepted stays in force.
    unit.add({ sql: 'UPDATE core_access_profiles SET pending = ?, message = ?, decided_at = ?, decided_by = ?, flagged_at = NULL, updated_at = ? WHERE account_id = ?', params: [decision.action === 'reject' ? null : row.pending, await sealSpecial(message), at, actor.accountId!, at, accountId] }).expect(1)
  }
  else {
    unit.add({
      sql: 'UPDATE core_access_profiles SET status = ?, message = ?, decided_at = ?, decided_by = ?, flagged_at = NULL, updated_at = ? WHERE account_id = ?',
      params: [decision.action === 'reject' ? 'rejected' : 'more-info', await sealSpecial(message), at, actor.accountId!, at, accountId],
    }).expect(1)
  }
  unit.audit({ action: 'state', ability: 'core.access-scheme.review', record: ['core.account', accountId], detail: { accessDecision: decision.action } })
  await notify(unit, 'core.access-application-decided', { to: accountId, variables: { scheme: await schemeName() } })
}

/** Marks an accepted application verified, or removes the mark (ID-41). The person is told. */
export async function setVerified(unit: UnitView, actor: Actor, accountId: string, method: VerifiedMethod | null): Promise<void> {
  const row = await profileOf(accountId)
  if (row?.status !== 'accepted') refuse('core.access.not-accepted', 'Only an accepted application can be verified.', { status: 409 })
  const app = (await openApp(row.payload))!
  const at = nowMs()
  unit.add({
    sql: 'UPDATE core_access_profiles SET verified_at = ?, verified_by = ?, verified_method = ?, verified_companions = ?, updated_at = ? WHERE account_id = ? AND status = \'accepted\'',
    params: method ? [at, actor.accountId!, await sealSpecial(method), app.companions, at, accountId] : [null, null, null, null, at, accountId],
  }).expect(1)
  unit.audit({ action: 'state', ability: 'core.access-scheme.review', record: ['core.account', accountId], detail: { accessVerified: !!method } })
  await notify(unit, 'core.access-application-decided', { to: accountId, variables: { scheme: await schemeName() } })
}

/** Leaving the scheme deletes the application and the sharing choices at once (ID-44). */
export async function withdraw(unit: UnitView, accountId: string): Promise<void> {
  unit.add({ sql: 'DELETE FROM core_access_profiles WHERE account_id = ?', params: [accountId] }).expect(1, { code: 'core.not-found', reason: 'There is no application to withdraw.' })
  unit.add({ sql: 'DELETE FROM core_access_shares WHERE account_id = ?', params: [accountId] })
  unit.audit({ action: 'delete', record: ['core.account', accountId], detail: { accessApplication: 'withdrawn' } })
}

/** The person confirms their details are still right, which resets the review date (ID-44). */
export async function confirmStillRight(unit: UnitView, accountId: string): Promise<void> {
  const reviewAfter = await useSetting('core.access-scheme.review-after') as number
  const at = nowMs()
  unit.add({ sql: 'UPDATE core_access_profiles SET review_due = ?, reminders = 0, updated_at = ? WHERE account_id = ? AND status = \'accepted\'', params: [at + reviewAfter * 1000, at, accountId] }) // not-policy: seconds to milliseconds
    .expect(1, { code: 'core.access.not-accepted', reason: 'There is no accepted application to confirm.' })
}

/** A person's own view of their application, in full: it is their own record. */
export async function myApplication(accountId: string) {
  const row = await profileOf(accountId)
  if (!row) return null
  const inForce = await openApp(row.payload)
  return {
    status: row.status,
    inForce,
    pending: await openApp(row.pending),
    message: await openSpecial(row.message),
    verified: !!row.verified_at && (row.verified_companions ?? 0) >= (inForce?.companions ?? 0),
    companions: companionsInForce(row, inForce, !!(await useSetting('core.access-scheme.companions-need-verified'))),
    submittedVia: row.submitted_via,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    reviewDue: row.review_due,
  }
}

/** The purposes the person can switch on or off, with whether each is on (ID-39, ID-44). */
export async function sharingOf(accountId: string, actor: Actor) {
  const on = new Set((await all<{ purpose: string }>('SELECT purpose FROM core_access_shares WHERE account_id = ?', accountId)).map(r => r.purpose))
  const out = []
  for (const { module, value } of await purposes()) {
    if (!(await isEnabled(module))) continue
    if (value.side === 'members' && !(await hasStanding(actor))) continue
    out.push({ id: value.id, label: value.label, explanation: value.explanation, on: on.has(value.id), fixed: !!value.agreedOnApplying })
  }
  return out
}

export async function setSharing(unit: UnitView, actor: Actor, accountId: string, purposeId: string, on: boolean): Promise<void> {
  const purpose = (await sharingOf(accountId, actor)).find(p => p.id === purposeId)
  if (!purpose) refuse('core.not-found', 'There is no such use.', { status: 404 })
  if (purpose.fixed && !on && (await profileOf(accountId))) refuse('core.access.share-fixed', 'The box office always sees your arrangements while you are on the scheme.', { status: 409, remedy: 'Leave the scheme to stop it.' })
  if (on) unit.add({ sql: 'INSERT OR IGNORE INTO core_access_shares (account_id, purpose, created_at) VALUES (?, ?, ?)', params: [accountId, purposeId, nowMs()] })
  else unit.add({ sql: 'DELETE FROM core_access_shares WHERE account_id = ? AND purpose = ?', params: [accountId, purposeId] })
  unit.audit({ action: 'update', record: ['core.account', accountId], detail: { accessShare: purposeId, on } })
}

/**
 * The one way a module reads access needs (ID-39). It answers only when the application is accepted,
 * the purpose is declared and its module on, the person has switched it on, and the actor holds the
 * purpose's ability for this person. Otherwise it answers null, the same way whichever test failed.
 * Every answer writes an audit entry of kind read with the purpose and the record.
 */
export async function accessNeedsFor(unit: UnitView, actor: Actor, accountId: string, purposeId: string, record?: readonly [string, string]): Promise<{ needs: { key: string, label: string, note?: string }[], companions: number } | null> {
  const found = (await purposes()).find(p => p.value.id === purposeId)
  if (!found || !(await isEnabled(found.module))) return null
  const purpose = found.value
  const ability = purpose.ability ?? 'core.access-profile.read'
  if (!(await can(actor, ability as Parameters<typeof can>[1], ['core.account', accountId])).allowed) return null
  const share = await first<{ purpose: string }>('SELECT purpose FROM core_access_shares WHERE account_id = ? AND purpose = ?', accountId, purposeId)
  const row = await profileOf(accountId)
  if (!share || row?.status !== 'accepted') return null
  const app = (await openApp(row.payload))!
  const needs: { key: string, label: string, note?: string }[] = []
  for (const need of app.needs) {
    const term = await getTerm(need.term)
    if (!term || (purpose.uses !== 'all' && !purpose.uses.includes(term.slug))) continue
    needs.push({ key: term.slug, label: term.label, ...(purpose.note && need.note ? { note: need.note } : {}) })
  }
  unit.audit({ action: 'read', ability, record: ['core.account', accountId], detail: { purpose: purposeId, ...(record ? { about: `${record[0]}:${record[1]}` } : {}) } })
  return { needs, companions: companionsInForce(row, app, !!(await useSetting('core.access-scheme.companions-need-verified'))) }
}

/** Every read of the person's application by staff, for them to see (ID-44). */
export async function readsOfApplication(accountId: string) {
  const rows = await all<{ at: number, ability: string | null, detail: string | null, actor_kind: string }>(
    `SELECT at, ability, detail, actor_kind FROM core_audit
      WHERE record_type = 'core.account' AND record_id = ? AND action = 'read'
        AND (ability IN ('core.access-scheme.read', 'core.access-scheme.review', 'core.access-profile.read') OR detail LIKE '%"purpose"%')
      ORDER BY at DESC LIMIT 200`, accountId) // not-policy: a page of the history
  return rows.map((r) => {
    const detail = r.detail ? JSON.parse(r.detail) as { purpose?: string } : {}
    return { at: r.at, capacity: r.ability, purpose: detail.purpose ?? null }
  })
}

/**
 * The reviewers' queue (ID-40): open applications and changes, oldest first, with the person's name
 * and how long each has waited. It reads no needs; those show only when one is opened.
 */
export async function reviewQueue() {
  const replyWithin = await useSetting('core.access-scheme.reply-within') as number
  const at = nowMs()
  const rows = await all<{ account_id: string, status: string, submitted_at: number, submitted_via: string, name: string | null }>(
    `SELECT p.account_id, p.status, p.submitted_at, p.submitted_via, coalesce(a.preferred_name, a.name) AS name
       FROM core_access_profiles p JOIN core_accounts a ON a.id = p.account_id
      WHERE p.status = 'submitted' OR (p.status = 'accepted' AND p.pending IS NOT NULL)
      ORDER BY p.submitted_at`,
  )
  return rows.map(r => ({
    accountId: r.account_id,
    name: r.name,
    change: r.status === 'accepted',
    submittedVia: r.submitted_via,
    waitingFor: at - r.submitted_at,
    overdue: at - r.submitted_at > replyWithin * 1000, // not-policy: seconds to milliseconds
  }))
}

/**
 * What happened to an application, newest first, for the reviewer's page (ID-40): applied, changed,
 * each decision and each verification, with who did it. It names no need.
 */
export async function historyOf(accountId: string) {
  const rows = await all<{ at: number, actor_name: string | null, detail: string }>(
    `SELECT at, actor_name, detail FROM core_audit
      WHERE record_type = 'core.account' AND record_id = ? AND action IN ('create', 'update', 'state')
        AND (detail LIKE '%"accessApplication"%' OR detail LIKE '%"accessDecision"%' OR detail LIKE '%"accessVerified"%')
      ORDER BY at DESC LIMIT 100`, accountId) // not-policy: a page of the history
  return rows.map((r) => {
    const detail = JSON.parse(r.detail) as { accessApplication?: string, accessDecision?: string, accessVerified?: boolean }
    const event = detail.accessDecision ?? (detail.accessVerified === undefined ? `applied-${detail.accessApplication}` : detail.accessVerified ? 'verified' : 'unverified')
    return { at: r.at, by: r.actor_name, event }
  })
}

/** One application opened by a reviewer. The route's ability writes the read to the audit trail. */
export async function openForReview(accountId: string) {
  const row = await profileOf(accountId)
  if (!row) return null
  return {
    flagged: row.flagged_at !== null,
    decidedAt: row.decided_at,
    status: row.status,
    inForce: await openApp(row.payload),
    pending: await openApp(row.pending),
    message: await openSpecial(row.message),
    submittedVia: row.submitted_via,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    verifiedAt: row.verified_at,
    verifiedMethod: await openSpecial(row.verified_method),
    reviewDue: row.review_due,
  }
}

/** True while the person's application is accepted: the fact core.access-scheme. */
export async function onScheme(accountId: string | undefined): Promise<boolean> {
  if (!accountId) return false
  const row = await first<{ status: string }>('SELECT status FROM core_access_profiles WHERE account_id = ?', accountId)
  return row?.status === 'accepted'
}

/** The companions an account may book now, for the requirement source. */
export async function companionsFor(accountId: string): Promise<number> {
  const row = await profileOf(accountId)
  if (!row) return 0
  return companionsInForce(row, await openApp(row.payload), !!(await useSetting('core.access-scheme.companions-need-verified')))
}

/**
 * The scheme's part of the hourly sweep: a rejected application goes after keep-rejected; an
 * accepted one past its review date is asked to confirm, twice, a reply-within apart, and then goes
 * to the reviewers' queue while staying in force.
 */
export async function sweepAccessScheme(unit: UnitView): Promise<void> {
  const at = nowMs()
  const keepRejected = await useSetting('core.access-scheme.keep-rejected') as number
  const gap = await useSetting('core.access-scheme.reply-within') as number
  unit.add({ sql: 'DELETE FROM core_access_profiles WHERE status = \'rejected\' AND decided_at <= ?', params: [at - keepRejected * 1000] }) // not-policy: seconds to milliseconds
  const due = await all<ProfileRow>('SELECT * FROM core_access_profiles WHERE status = \'accepted\' AND pending IS NULL AND review_due <= ? ORDER BY review_due LIMIT 20', at) // not-policy: a batch per run
  const scheme = await schemeName()
  for (const row of due) {
    if (row.reminders >= 2) { // not-policy: the specification's two reminders
      unit.add({ sql: 'UPDATE core_access_profiles SET pending = payload, submitted_at = ?, updated_at = ? WHERE account_id = ? AND pending IS NULL', params: [at, at, row.account_id] })
      continue
    }
    unit.add({ sql: 'UPDATE core_access_profiles SET reminders = reminders + 1, review_due = ?, updated_at = ? WHERE account_id = ?', params: [at + gap * 1000, at, row.account_id] }) // not-policy: seconds to milliseconds
    await notify(unit, 'core.access-review-due', { to: row.account_id, variables: { scheme }, dedupeKey: `${row.account_id}:${row.review_due}:${row.reminders}` })
  }
  await flagWaiting(unit, at, gap, scheme)
}

/**
 * Applications waiting longer than reply-within are flagged once, and the reviewers told in one
 * message per sweep (ID-40). A reviewer is not told about their own application.
 */
async function flagWaiting(unit: UnitView, at: number, replyWithin: number, scheme: string): Promise<void> {
  const late = await all<{ account_id: string }>(
    `SELECT account_id FROM core_access_profiles
      WHERE flagged_at IS NULL AND pending IS NOT NULL AND (status = 'submitted' OR status = 'accepted') AND submitted_at <= ?`,
    at - replyWithin * 1000, // not-policy: seconds to milliseconds
  )
  if (!late.length) return
  for (const r of late) unit.add({ sql: 'UPDATE core_access_profiles SET flagged_at = ? WHERE account_id = ? AND flagged_at IS NULL', params: [at, r.account_id] })
  for (const reviewer of await holdersOf('core.access-scheme.review')) {
    const count = late.filter(r => r.account_id !== reviewer).length
    if (!count) continue
    await notify(unit, 'core.access-application-waiting', {
      to: reviewer,
      variables: { scheme, count: String(count) },
      dedupeKey: `${reviewer}:${at}`,
    })
  }
}

/**
 * "Apply for someone" from the queue (ID-42): finds or makes the account for a name and an address,
 * for a reviewer about to fill the form in with the person on the phone or at the desk. It sends
 * nothing. Says whether they have applied already, so the page can open their application instead.
 */
export async function personToApplyFor(unit: UnitView, actor: Actor, input: { name: string, address: string }): Promise<{ accountId: string, applied: boolean }> {
  if (!(await schemeEnabled())) NOT_FOUND()
  const found = await findOrCreateAccount(unit, { address: normaliseAddress(input.address), name: input.name, origin: 'staff' })
  if (found.accountId === actor.accountId) refuse('core.access.own-record', 'You cannot apply for yourself from here.', { status: 403, remedy: 'Apply from your own account instead.' })
  const row = found.created ? null : await profileOf(found.accountId)
  return { accountId: found.accountId, applied: !!row && row.status !== 'rejected' }
}

/** Where an invitation's link lands once it has signed the person in: the form, open. */
export const APPLY_PATH = '/account/access/apply'

/**
 * "Invite to apply" (ID-42): finds or makes the account for a name and an address, and emails a
 * single-use link that signs the person in and opens the form. The link lapses after
 * core.sign-in.invite-lifetime; after that, signing in and pressing "Apply" does the same. The email
 * goes once the unit has committed, so a refused invitation sends nothing.
 */
export async function inviteToApply(unit: UnitView, event: H3Event, actor: Actor, input: { name: string, address: string }): Promise<{ accountId: string }> {
  if (!(await schemeEnabled())) NOT_FOUND()
  const address = normaliseAddress(input.address)
  const found = await findOrCreateAccount(unit, { address, name: input.name, origin: 'invite' })
  if (found.accountId === actor.accountId) refuse('core.access.own-record', 'You cannot invite yourself.', { status: 403, remedy: 'Apply from your own account instead.' })
  const token = randomToken()
  const id = newId('tok', { random: true })
  const at = nowMs()
  const lifetime = await useSetting('core.sign-in.invite-lifetime') as number
  unit.add({
    sql: `INSERT INTO core_account_tokens (id, purpose, token_hash, account_id, address, issued_by, next_path, attempts, created_at, expires_at)
          VALUES (?, 'invite', ?, ?, ?, ?, ?, 0, ?, ?)`,
    params: [id, await digest('link', token), found.accountId, address, actor.accountId ?? null, APPLY_PATH, at, at + lifetime * 1000], // not-policy: seconds to milliseconds
  })
  unit.audit({ action: 'create', ability: 'core.access-scheme.review', record: ['core.account', found.accountId], detail: { accessInvitation: true } })
  const link = `${(await relyingParty(event)).origin}/sign-in/link#${token}`
  const scheme = await schemeName()
  // Written in this unit and sent after it commits, with the pipeline's retries; the link is sealed.
  await notifyAddress(unit, 'core.access-invitation', { address, variables: { link, scheme }, dedupeKey: id })
  return { accountId: found.accountId }
}
