// Till sessions (Box office specification, part 3, "A till session", and PAY-03). A seller opens one
// with a float, takes payments in it, and cashes up: counting stops new payments, the cash counted is
// compared with what is expected, and any difference is explained and posted to
// payments.cash-variance. Above payments.sessions.variance-needs-second-person, a second person closes
// a session with a difference. A theatre that takes no cash (payments.cash.enabled off, the default)
// still opens sessions, since desk sales are made in one, but they hold no float and close with
// nothing to count.
//
// Opening the till opens the seller's session (selling proposal, 17 November 2026), at a place: the
// space the device used last, else payments.sessions.default-space, else unknown. A session with no
// cash and nothing waiting closes itself after payments.sessions.close-when-quiet; one with cash
// stops instead and awaits its count, which no longer stops the seller opening the next.
import { all, first, newId, nowMs, Refusal, useSetting, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { getSpace, placeName } from '#modules/core'
import { postEntries } from '#modules/finance'
import { labelsOf } from './people'

export interface SessionRow { id: string, point_label: string, space_id: string | null, closed_how: 'hand' | 'quiet' | null, opened_by: string, closed_by: string | null, opened_at: number, closed_at: number | null, state: 'open' | 'counting' | 'closed', float_minor: number, expected_cash_minor: number | null, counted_cash_minor: number | null, variance_note: string | null, currency: string }

export async function getSession(id: string): Promise<SessionRow | null> {
  return first<SessionRow>('SELECT * FROM payments_sessions WHERE id = ?', id)
}

/** The person's open session, the one their sales go into, if they have one. */
export async function sessionOf(accountId: string): Promise<SessionRow | null> {
  return first<SessionRow>(`SELECT * FROM payments_sessions WHERE state = 'open' AND opened_by IN (${accountScopeSql('?1')}) ORDER BY opened_at DESC LIMIT 1`, accountId)
}

/** The person's sessions that have stopped and are waiting for their cash to be counted, oldest first. */
export async function awaitingCountOf(accountId: string): Promise<SessionRow[]> {
  return all<SessionRow>(`SELECT * FROM payments_sessions WHERE state = 'counting' AND opened_by IN (${accountScopeSql('?1')}) ORDER BY opened_at`, accountId)
}

/** Whether any cash has moved in the session: taken, or handed back from it. */
export async function cashMoved(sessionId: string): Promise<boolean> {
  return !!(await first(`SELECT 1 FROM payments_attempts a JOIN payments_intents i ON i.id = a.intent_id WHERE i.session_id = ?1 AND a.method = 'cash' AND a.state = 'succeeded'
    UNION ALL SELECT 1 FROM payments_refunds r WHERE r.session_id = ?1 AND r.state = 'succeeded' LIMIT 1`, sessionId))
}

/** A space a session may be at: one that exists and is not archived. */
async function checkSpace(spaceId: string | null | undefined): Promise<string | null> {
  if (!spaceId) return null
  const space = await getSpace(spaceId)
  if (!space || space.archived) throw new Refusal('payments.session.no-such-space', 'There is no such space.', { status: 422, fields: { spaceId: 'payments.session.no-such-space' } })
  return space.id
}

/** Expected cash: the float, plus cash taken in the session, less cash handed back from it. */
export async function expectedCash(session: SessionRow): Promise<number> {
  const row = await first<{ taken: number, back: number }>(`SELECT
      (SELECT coalesce(sum(a.amount_minor), 0) FROM payments_attempts a JOIN payments_intents i ON i.id = a.intent_id WHERE i.session_id = ? AND a.method = 'cash' AND a.state = 'succeeded') AS taken,
      (SELECT coalesce(sum(r.amount_minor), 0) FROM payments_refunds r WHERE r.session_id = ? AND r.state = 'succeeded') AS back`, session.id, session.id)
  return session.float_minor + (row?.taken ?? 0) - (row?.back ?? 0)
}

/**
 * Opens a session for the person, at a space (none is unknown) with an optional note. Refused while
 * they have another open; one awaiting its count does not stop it.
 */
export async function openSession(unit: UnitView, input: { accountId: string, spaceId?: string | null, pointLabel?: string, floatMinor?: number }): Promise<string> {
  if (await sessionOf(input.accountId)) throw new Refusal('payments.session.already-open', 'You already have a till session open.', { status: 409, remedy: 'Close that session first.' })
  const spaceId = await checkSpace(input.spaceId)
  const cash = await useSetting('payments.cash.enabled')
  if (!cash && input.floatMinor) throw new Refusal('payments.session.no-cash', 'Cash is not taken, so a session has no float.', { status: 422, fields: { floatMinor: 'payments.session.no-cash' }, remedy: 'Leave the float empty, or turn on taking cash in Payments settings.' })
  const float = input.floatMinor ?? (cash ? await useSetting('payments.sessions.default-float') as number : 0)
  if (!Number.isSafeInteger(float) || float < 0) throw new Refusal('payments.session.bad-float', 'The float is a whole amount, nothing or more.', { status: 422, fields: { floatMinor: 'payments.session.bad-float' } })
  const id = newId('till')
  const at = nowMs()
  const currency = await useSetting('core.locale.currency') as string
  // The partial unique index on opened_by refuses a race the read did not see. It compares stored ids,
  // which is why opened_by moves on a merge.
  unit.add({
    sql: `INSERT INTO payments_sessions (id, point_label, space_id, opened_by, opened_at, state, float_minor, currency, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, 'open', ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM payments_sessions WHERE state = 'open'
        AND opened_by = ? -- exact-account: the one-open-session index compares stored ids
      )`,
    params: [id, input.pointLabel?.trim() ?? '', spaceId, input.accountId, at, float, currency, at, at, input.accountId],
  }).expect(1, { code: 'payments.session.already-open', reason: 'You already have a till session open.' })
  return id
}

/**
 * Moves a session to another space or changes its note; while it is open and no cash has moved in
 * it, also its float. Who may do it is the route's question.
 */
export async function placeSession(unit: UnitView, session: SessionRow, input: { spaceId?: string | null, pointLabel?: string, floatMinor?: number }): Promise<void> {
  const spaceId = input.spaceId === undefined ? session.space_id : await checkSpace(input.spaceId)
  const note = input.pointLabel === undefined ? session.point_label : input.pointLabel.trim()
  let float = session.float_minor
  if (input.floatMinor !== undefined && input.floatMinor !== session.float_minor) {
    if (!(await useSetting('payments.cash.enabled')) && input.floatMinor) throw new Refusal('payments.session.no-cash', 'Cash is not taken, so a session has no float.', { status: 422, fields: { floatMinor: 'payments.session.no-cash' } })
    if (session.state !== 'open' || await cashMoved(session.id)) throw new Refusal('payments.session.float-fixed', 'The float can only change before the first cash is taken.', { status: 409, fields: { floatMinor: 'payments.session.float-fixed' } })
    if (!Number.isSafeInteger(input.floatMinor) || input.floatMinor < 0) throw new Refusal('payments.session.bad-float', 'The float is a whole amount, nothing or more.', { status: 422, fields: { floatMinor: 'payments.session.bad-float' } })
    float = input.floatMinor
  }
  unit.add({
    sql: 'UPDATE payments_sessions SET space_id = ?, point_label = ?, float_minor = ?, updated_at = ? WHERE id = ? AND state = ?',
    params: [spaceId, note, float, nowMs(), session.id, session.state],
  }).expect(1, { code: 'payments.session.changed', reason: 'This session changed while you were looking at it.' })
}

/** Stops new payments and works out the cash expected. Refused while a payment in it has no answer. */
export async function startCount(unit: UnitView, session: SessionRow): Promise<number> {
  if (session.state !== 'open') throw new Refusal('payments.session.not-open', 'This session is not open.', { status: 409 })
  const expected = await expectedCash(session)
  unit.add({
    sql: `UPDATE payments_sessions SET state = 'counting', expected_cash_minor = ?, updated_at = ? WHERE id = ? AND state = 'open'
      AND NOT EXISTS (SELECT 1 FROM payments_attempts a JOIN payments_intents i ON i.id = a.intent_id WHERE i.session_id = ? AND a.state IN ('started', 'pending', 'unknown'))`,
    params: [expected, nowMs(), session.id, session.id],
  }).expect(1, { code: 'payments.session.payment-waiting', reason: 'A payment in this session is still waiting for its answer.' })
  return expected
}

export interface CloseInput {
  countedMinor: number
  varianceNote?: string
  /** The person closing. */
  by: string
  /** Whether they hold payments.session.close-any. */
  canCloseAny: boolean
}

/**
 * Closes a session being counted. A difference needs a reason and is posted; a difference above the
 * limit on one's own session needs someone else with close-any. Own is judged on resolved accounts.
 */
export async function closeSession(unit: UnitView, session: SessionRow, input: CloseInput): Promise<{ varianceMinor: number }> {
  if (session.state !== 'counting') throw new Refusal('payments.session.not-counting', 'Count this session before closing it.', { status: 409 })
  if (!Number.isSafeInteger(input.countedMinor) || input.countedMinor < 0) throw new Refusal('payments.session.bad-count', 'The cash counted is a whole amount, nothing or more.', { status: 422, fields: { countedMinor: 'payments.session.bad-count' } })
  const expected = session.expected_cash_minor ?? await expectedCash(session)
  const variance = input.countedMinor - expected
  const note = input.varianceNote?.trim() || null
  if (variance !== 0 && !note) throw new Refusal('payments.session.reason-needed', 'Say why the cash counted differs from what was expected.', { status: 422, fields: { varianceNote: 'payments.session.reason-needed' } })
  const own = !!(await first<{ id: string }>(`SELECT id FROM payments_sessions WHERE id = ?1 AND opened_by IN (${accountScopeSql('?2')})`, session.id, input.by))
  if (!own && !input.canCloseAny) throw new Refusal('core.access.denied', 'Only the person who opened this session, or someone allowed to close any, may close it.', { status: 403 })
  const limit = await useSetting('payments.sessions.variance-needs-second-person') as number
  if (own && Math.abs(variance) > limit) throw new Refusal('payments.session.second-person-needed', 'The difference is above the limit, so someone else must close this session.', { status: 409, remedy: 'Ask someone allowed to close any session to close it.' })

  const at = nowMs()
  unit.add({
    sql: "UPDATE payments_sessions SET state = 'closed', counted_cash_minor = ?, variance_note = ?, closed_by = ?, closed_at = ?, closed_how = 'hand', updated_at = ? WHERE id = ? AND state = 'counting'",
    params: [input.countedMinor, note, input.by, at, at, session.id],
  }).expect(1, { code: 'payments.session.not-counting', reason: 'This session is no longer being counted.' })
  if (variance !== 0) {
    await postEntries(unit, {
      key: `payments:session:${session.id}:variance`,
      source: { module: 'payments', type: 'payments.session', id: session.id },
      kind: 'cash_variance',
      currency: session.currency,
      postedBy: input.by,
      entries: [
        { account: { key: 'payments.cash' }, amountMinor: variance },
        { account: { key: 'payments.cash-variance' }, amountMinor: -variance },
      ],
    })
  }
  unit.announce('payments.session.closed', { sessionId: session.id }, { record: ['payments.session', session.id] })
  return { varianceMinor: variance }
}

/**
 * handlesCash: whether the session has cash to count, because cash is taken or it held a float or
 * cash anyway. place: its space as a person reads it, null for unknown; pointLabel is its note.
 */
export interface SessionSummary { handlesCash: boolean, id: string, spaceId: string | null, place: string | null, pointLabel: string, closedHow: 'hand' | 'quiet' | null, openedBy: string, openedByName: string, closedBy: string | null, closedByName: string | null, openedAt: number, closedAt: number | null, state: string, floatMinor: number, expectedCashMinor: number, countedCashMinor: number | null, varianceMinor: number | null, varianceNote: string | null, currency: string }

export async function summarise(session: SessionRow, names?: Map<string, string>, cashTaken?: boolean): Promise<SessionSummary> {
  const expected = session.expected_cash_minor ?? await expectedCash(session)
  const label = names ?? await labelsOf([session.opened_by, session.closed_by])
  const cash = cashTaken ?? !!(await useSetting('payments.cash.enabled'))
  return {
    handlesCash: cash || session.float_minor > 0 || expected !== 0 || (session.counted_cash_minor ?? 0) > 0,
    id: session.id,
    spaceId: session.space_id,
    place: session.space_id ? await placeName(session.space_id) : null,
    pointLabel: session.point_label,
    closedHow: session.closed_how,
    openedBy: session.opened_by,
    openedByName: label.get(session.opened_by) ?? '',
    closedBy: session.closed_by,
    closedByName: session.closed_by ? label.get(session.closed_by) ?? '' : null,
    openedAt: session.opened_at,
    closedAt: session.closed_at,
    state: session.state,
    floatMinor: session.float_minor,
    expectedCashMinor: expected,
    countedCashMinor: session.counted_cash_minor,
    varianceMinor: session.counted_cash_minor === null ? null : session.counted_cash_minor - expected,
    varianceNote: session.variance_note,
    currency: session.currency,
  }
}

/** The sessions with these ids, as Sessions shows them, in the order given. */
export async function describeSessions(ids: string[]): Promise<SessionSummary[]> {
  if (!ids.length) return []
  const found = await all<SessionRow>('SELECT * FROM payments_sessions WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))
  const byId = new Map(found.map(r => [r.id, r]))
  const rows = ids.flatMap(id => byId.get(id) ?? [])
  const names = await labelsOf(rows.flatMap(r => [r.opened_by, r.closed_by]))
  const cash = !!(await useSetting('payments.cash.enabled'))
  return Promise.all(rows.map(r => summarise(r, names, cash)))
}

const SECOND = 1000 // not-policy: settings hold seconds, times are milliseconds

export interface WaitingAttempt { id: string, method: string, amountMinor: number, currency: string, state: string, provider: string, startedAt: number, unknownAt: number | null }

/**
 * The payments in a session still waiting for an answer: what stops it being counted. A started or
 * pending one becomes unknown at unknownAt if nothing answers; an unknown one waits for someone to
 * settle it on Needs attention.
 */
export async function waitingIn(sessionId: string): Promise<WaitingAttempt[]> {
  const answerWithin = await useSetting('payments.attempts.answer-within') as number
  const rows = await all<{ id: string, method: string, amount_minor: number, currency: string, state: string, label: string, started_at: number }>(
    `SELECT a.id, a.method, a.amount_minor, i.currency, a.state, p.label, a.started_at FROM payments_attempts a
      JOIN payments_intents i ON i.id = a.intent_id JOIN payments_provider_accounts p ON p.id = a.provider_account_id
      WHERE i.session_id = ? AND a.state IN ('started', 'pending', 'unknown') ORDER BY a.started_at`, sessionId)
  return rows.map(r => ({ id: r.id, method: r.method, amountMinor: r.amount_minor, currency: r.currency, state: r.state, provider: r.label, startedAt: r.started_at, unknownAt: r.state === 'unknown' ? null : r.started_at + answerWithin * SECOND }))
}

/** The newest sale in a session that is still open: started, and neither paid nor cancelled. */
export async function unfinishedIn(sessionId: string): Promise<{ intentId: string, amountMinor: number } | null> {
  const row = await first<{ id: string, amount_minor: number }>("SELECT id, amount_minor FROM payments_intents WHERE session_id = ? AND state = 'open' ORDER BY created_at DESC LIMIT 1", sessionId)
  return row ? { intentId: row.id, amountMinor: row.amount_minor } : null
}

/** When a sale was last made in the session, or when it opened if none was. */
export async function lastSaleIn(session: SessionRow): Promise<number> {
  const row = await first<{ at: number | null }>('SELECT max(created_at) AS at FROM payments_intents WHERE session_id = ?', session.id)
  return Math.max(session.opened_at, row?.at ?? 0)
}

/** When an open session closes itself if nothing more is sold in it. */
export async function closesAt(session: SessionRow): Promise<number> {
  const quiet = await useSetting('payments.sessions.close-when-quiet') as number
  return await lastSaleIn(session) + quiet * SECOND
}

/**
 * Ends a session that has been quiet for payments.sessions.close-when-quiet: one with no float, no
 * cash moved and no payment waiting closes itself; one with cash stops and awaits its count, shown
 * under Needs attention. A payment still waiting leaves it open until it has its answer.
 */
export async function closeIfQuiet(unit: UnitView, session: SessionRow): Promise<'closed' | 'counting' | null> {
  if (session.state !== 'open' || await closesAt(session) > nowMs()) return null
  if ((await waitingIn(session.id)).length) return null
  if (session.float_minor > 0 || await cashMoved(session.id)) {
    await startCount(unit, session)
    return 'counting'
  }
  const at = nowMs()
  unit.add({
    sql: `UPDATE payments_sessions SET state = 'closed', expected_cash_minor = 0, counted_cash_minor = 0, closed_at = ?, closed_how = 'quiet', updated_at = ? WHERE id = ? AND state = 'open'
      AND NOT EXISTS (SELECT 1 FROM payments_attempts a JOIN payments_intents i ON i.id = a.intent_id WHERE i.session_id = ? AND a.state IN ('started', 'pending', 'unknown'))`,
    params: [at, at, session.id, session.id],
  }).expect(1, { code: 'payments.session.not-quiet', reason: 'This session is no longer quiet.' })
  unit.announce('payments.session.closed', { sessionId: session.id }, { record: ['payments.session', session.id] })
  return 'closed'
}
