// Data requests (ID-16, ID-35; part 3, "Export and erasure"). An erasure is asked for by the person,
// freshly re-asserted, or by staff for somebody who asked another way. It waits for the emailed link,
// then for core.privacy.cooling-off, then for every module's hold to clear, and runs once. Staff see
// every request with its respond-by date and close it once each table that may hold rows linked to
// no account has been searched by hand.
import type { H3Event } from 'h3'
import { all, createUnit, first, isEnabled, newId, nowMs, refuse, useSetting, type Actor, type UnitView } from '#kit'
import { useRegistry } from '#kit/registry'
import { formatDuration } from '#kit/duration'
import type { TableMeta } from '#kit/db'
import { notify } from '../notifications/notify'
import { notifyAddress } from '../notifications/send'
import { accountById } from './accounts'
import { digest, randomToken } from './crypto'
import { eraseAccount, erasureHolds } from './erasure'
import { relyingParty } from './web'
import { fileUrl } from '../files/service'
import type { IDENTITY_CHECKS } from '../db/identity'

export type IdentityCheck = typeof IDENTITY_CHECKS[number]
type State = 'requested' | 'confirmed' | 'held' | 'running' | 'done' | 'cancelled' | 'failed'

export interface DataRequestRow {
  id: string
  account_id: string
  kind: 'export' | 'erasure'
  state: State
  requested_by: string
  requested_at: number
  identity_check: IdentityCheck | null
  respond_by: number
  not_before: number | null
  holds: string | null
  file_id: string | null
  finished_at: number | null
  closed_at: number | null
  closed_by: string | null
}

const OPEN: State[] = ['requested', 'confirmed', 'held', 'running']
const inList = (states: State[]) => states.map(s => `'${s}'`).join(', ')

/** Erasure and the download are not offered until the theatre names its privacy contact. */
export async function privacyReady(): Promise<boolean> {
  return !!(await useSetting('core.privacy.contact'))
}

export async function requestById(id: string): Promise<DataRequestRow | null> {
  return first<DataRequestRow>('SELECT * FROM core_data_requests WHERE id = ?', id)
}

/**
 * Asks for an erasure: the request is written, and a link to confirm it goes to the person's
 * audience address. Nothing else happens until it is used. The link lasts until the respond-by date.
 */
export async function requestErasure(unit: UnitView, event: H3Event, actor: Actor, input: { accountId: string, identityCheck?: IdentityCheck }): Promise<{ id: string }> {
  if (!(await privacyReady())) refuse('core.privacy.contact-unset', 'Erasure is not available yet.', { status: 409, remedy: 'The theatre needs to say who to contact about personal data first.' })
  const account = await accountById(input.accountId)
  if (!account || account.anonymised_at || account.merged_into_id) refuse('core.not-found', 'There is no such person.', { status: 404 })
  const open = await first<{ id: string }>(`SELECT id FROM core_data_requests WHERE account_id = ? AND kind = 'erasure' AND state IN (${inList(OPEN)})`, account.id)
  if (open) refuse('core.data-request.open', 'An erasure has already been asked for.', { status: 409, remedy: 'Confirm or cancel that one first.' })
  const at = nowMs()
  const respondWithin = await useSetting('core.privacy.respond-within') as number
  const coolingOff = await useSetting('core.privacy.cooling-off') as number
  const id = newId('dreq')
  const respondBy = at + respondWithin * 1000 // not-policy: seconds to milliseconds
  unit.add({
    sql: `INSERT INTO core_data_requests (id, account_id, kind, state, requested_by, requested_at, identity_check, respond_by)
          VALUES (?, ?, 'erasure', 'requested', ?, ?, ?, ?)`,
    params: [id, account.id, actor.accountId!, at, input.identityCheck ?? null, respondBy],
  })
  const token = randomToken()
  unit.add({
    sql: `INSERT INTO core_account_tokens (id, purpose, token_hash, account_id, issued_by, attempts, created_at, expires_at)
          VALUES (?, 'confirm_erasure', ?, ?, ?, 0, ?, ?)`,
    params: [newId('tok', { random: true }), await digest('link', token), account.id, actor.accountId === account.id ? null : actor.accountId!, at, respondBy],
  })
  await notify(unit, 'core.erasure-confirm', {
    to: account.id,
    variables: { link: `${relyingParty(event).origin}/sign-in/confirm-erasure#${token}`, wait: formatDuration(coolingOff) },
    dedupeKey: id,
  })
  unit.audit({ action: 'create', ...(actor.accountId === account.id ? {} : { ability: 'core.data-request.manage' }), record: ['core.data-request', id], detail: { kind: 'erasure', identityCheck: input.identityCheck ?? null } })
  return { id }
}

const LINK_BAD = { code: 'core.data-request.link-unknown', reason: 'This link is not valid, or has been used, or the request was cancelled.', remedy: 'Ask for erasure again from your account.' }
const refuseLink = (): never => refuse(LINK_BAD.code, LINK_BAD.reason, { status: 410, remedy: LINK_BAD.remedy })

/**
 * Uses the emailed link. It proves the mailbox, so no session is needed. The cooling-off starts,
 * and any hold already standing is shown at once.
 */
export async function confirmErasure(unit: UnitView, token: string): Promise<{ notBefore: number, holds: string[] }> {
  const at = nowMs()
  const row = await first<{ id: string, account_id: string | null, used_at: number | null, expires_at: number }>(
    'SELECT id, account_id, used_at, expires_at FROM core_account_tokens WHERE token_hash = ? AND purpose = \'confirm_erasure\'', await digest('link', token),
  )
  if (!row?.account_id || row.used_at || row.expires_at <= at) return refuseLink()
  const request = await first<DataRequestRow>('SELECT * FROM core_data_requests WHERE account_id = ? AND kind = \'erasure\' AND state = \'requested\'', row.account_id)
  if (!request) return refuseLink()
  unit.add({ sql: 'UPDATE core_account_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL', params: [at, row.id] }).expect(1, LINK_BAD)
  const coolingOff = await useSetting('core.privacy.cooling-off') as number
  const notBefore = at + coolingOff * 1000 // not-policy: seconds to milliseconds
  const holds = await erasureHolds(request.account_id)
  unit.add({
    sql: 'UPDATE core_data_requests SET state = ?, not_before = ?, holds = ? WHERE id = ? AND state = \'requested\'',
    params: [holds.length ? 'held' : 'confirmed', notBefore, holds.length ? JSON.stringify(holds) : null, request.id],
  }).expect(1, LINK_BAD)
  unit.audit({ action: 'state', record: ['core.data-request', request.id], detail: { state: holds.length ? 'held' : 'confirmed', holds } })
  // With no cooling-off and nothing holding it, there is no reason to wait for the next review.
  if (!holds.length && notBefore <= at) startRun(unit, request.id)
  return { notBefore, holds }
}

function startRun(unit: UnitView, requestId: string): void {
  unit.add({ sql: 'UPDATE core_data_requests SET state = \'running\', holds = NULL WHERE id = ? AND state IN (\'confirmed\', \'held\')', params: [requestId] })
  unit.enqueue('core.run-erasure', { requestId })
}

/** Cancels a request before it runs. The person cancels their own; staff with the ability, anybody's. */
export async function cancelRequest(unit: UnitView, request: DataRequestRow, byStaff: boolean): Promise<void> {
  if (!['requested', 'confirmed', 'held'].includes(request.state)) refuse('core.data-request.not-cancellable', 'This request can no longer be cancelled.', { status: 409 })
  unit.add({ sql: 'UPDATE core_data_requests SET state = \'cancelled\', finished_at = ? WHERE id = ? AND state IN (\'requested\', \'confirmed\', \'held\')', params: [nowMs(), request.id] })
    .expect(1, { code: 'core.data-request.not-cancellable', reason: 'This request changed a moment ago.', remedy: 'Reload and look again.' })
  unit.add({ sql: 'UPDATE core_account_tokens SET used_at = ? WHERE purpose = \'confirm_erasure\' AND account_id = ? AND used_at IS NULL', params: [nowMs(), request.account_id] })
  unit.audit({ action: 'state', ...(byStaff ? { ability: 'core.data-request.manage' } : {}), record: ['core.data-request', request.id], detail: { state: 'cancelled' } })
}

/**
 * The hourly review (core.review-data-requests): a confirmed or held erasure whose cooling-off is
 * over runs if nothing holds it, and is held, with the codes, if something does.
 */
export async function reviewDataRequests(unit: UnitView): Promise<void> {
  const due = await all<DataRequestRow>('SELECT * FROM core_data_requests WHERE kind = \'erasure\' AND state IN (\'confirmed\', \'held\') AND not_before <= ? ORDER BY not_before LIMIT 20', nowMs()) // not-policy: a batch per run, well inside one unit
  for (const request of due) {
    const holds = await erasureHolds(request.account_id)
    if (!holds.length) startRun(unit, request.id)
    else if (JSON.stringify(holds) !== request.holds || request.state !== 'held')
      unit.add({ sql: 'UPDATE core_data_requests SET state = \'held\', holds = ? WHERE id = ? AND state IN (\'confirmed\', \'held\')', params: [JSON.stringify(holds), request.id] })
  }
}

/**
 * The job: runs one erasure. A hold that appeared since the review sends it back to waiting. A
 * second run on a finished request, or on a tombstone, writes nothing.
 */
export async function runErasure(unit: UnitView, requestId: string): Promise<void> {
  const request = await requestById(requestId)
  if (!request || request.state !== 'running') return
  const holds = await erasureHolds(request.account_id)
  if (holds.length) {
    unit.add({ sql: 'UPDATE core_data_requests SET state = \'held\', holds = ? WHERE id = ? AND state = \'running\'', params: [JSON.stringify(holds), request.id] })
    return
  }
  const erased = await eraseAccount(unit, request.account_id)
  unit.add({ sql: 'UPDATE core_data_requests SET state = \'done\', finished_at = ? WHERE id = ? AND state = \'running\'', params: [nowMs(), request.id] }).expect(1)
  unit.announce('core.data-request.finished', { requestId: request.id, kind: 'erasure' }, { record: ['core.data-request', request.id] })
  const address = erased?.address
  // Told once, at the address as it was, after the erasure has committed.
  if (address) {
    unit.afterCommit(async () => {
      // notifyAddress writes into a unit, so the notice gets its own once the erasure is in.
      const notice = createUnit()
      await notifyAddress(notice, 'core.erasure-done', { address, variables: {}, dedupeKey: request.id })
      await notice.commit()
    })
  }
}

/** What the person sees of their own requests: state, dates and the hold codes, never staff notes. */
export async function requestsOf(accountId: string) {
  // A finished download carries its link while the file is still kept.
  const rows = await all<DataRequestRow & { file_ready: number | null, file_expires_at: number | null }>(
    `SELECT r.*, (f.state = 'ready' AND (f.expires_at IS NULL OR f.expires_at > ?)) AS file_ready, f.expires_at AS file_expires_at
       FROM core_data_requests r LEFT JOIN core_files f ON f.id = r.file_id
      WHERE r.account_id = ? ORDER BY r.requested_at DESC`,
    nowMs(), accountId,
  )
  return rows.map(r => ({
    id: r.id,
    kind: r.kind,
    state: r.state,
    requestedAt: r.requested_at,
    notBefore: r.not_before,
    holds: r.holds ? JSON.parse(r.holds) as string[] : [],
    finishedAt: r.finished_at,
    ...(r.kind === 'export' && r.file_id && r.file_ready ? { download: { url: fileUrl(r.file_id), until: r.file_expires_at } } : {}),
  }))
}

/** Tables that may hold rows about a person with no account linked: the hand-search checklist. */
export async function uncheckedTables(): Promise<{ table: string, module: string }[]> {
  const out: { table: string, module: string }[] = []
  for (const [name, { module, meta }] of useRegistry().tables as Map<string, { module: string, meta: TableMeta }>) {
    const subject = meta.options.subject
    if (subject && typeof subject === 'object' && 'unlinked' in subject && (module === 'core' || await isEnabled(module))) out.push({ table: name, module })
  }
  return out.sort((a, b) => a.module.localeCompare(b.module) || a.table.localeCompare(b.table))
}

export async function checklistOf(requestId: string) {
  const ticks = await all<{ table_name: string, outcome: string, ticked_by: string, ticked_at: number }>('SELECT table_name, outcome, ticked_by, ticked_at FROM core_data_request_checks WHERE request_id = ?', requestId)
  return (await uncheckedTables()).map((line) => {
    const tick = ticks.find(t => t.table_name === line.table)
    return { ...line, outcome: tick?.outcome ?? null, tickedBy: tick?.ticked_by ?? null, tickedAt: tick?.ticked_at ?? null }
  })
}

export async function tick(unit: UnitView, actor: Actor, request: DataRequestRow, table: string, outcome: 'nothing-found' | 'handled'): Promise<void> {
  if (!(await uncheckedTables()).some(t => t.table === table)) refuse('core.data-request.no-such-line', 'That table is not on this request\'s checklist.', { status: 422 })
  if (request.closed_at) refuse('core.data-request.closed', 'This request is closed.', { status: 409 })
  unit.add({
    sql: `INSERT INTO core_data_request_checks (request_id, table_name, outcome, ticked_by, ticked_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (request_id, table_name) DO UPDATE SET outcome = excluded.outcome, ticked_by = excluded.ticked_by, ticked_at = excluded.ticked_at`,
    params: [request.id, table, outcome, actor.accountId!, nowMs()],
  })
  unit.audit({ action: 'update', ability: 'core.data-request.manage', record: ['core.data-request', request.id], detail: { table, outcome } })
}

/** Closes a request: its automatic part has run (or it was cancelled) and every line is ticked. */
export async function closeRequest(unit: UnitView, actor: Actor, request: DataRequestRow): Promise<void> {
  if (request.closed_at) return
  if (!['done', 'cancelled'].includes(request.state)) refuse('core.data-request.not-finished', 'This request has not finished yet.', { status: 409, remedy: 'Close it once it has run.' })
  const open = (await checklistOf(request.id)).filter(l => !l.outcome)
  if (request.state === 'done' && open.length) refuse('core.data-request.checklist-open', 'Some tables have not been searched yet.', { status: 409, remedy: `Search and tick: ${open.map(l => l.table).join(', ')}.` })
  unit.add({ sql: 'UPDATE core_data_requests SET closed_at = ?, closed_by = ? WHERE id = ? AND closed_at IS NULL', params: [nowMs(), actor.accountId!, request.id] })
  unit.audit({ action: 'state', ability: 'core.data-request.manage', record: ['core.data-request', request.id], detail: { closed: true } })
}
