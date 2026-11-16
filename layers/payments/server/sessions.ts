// Till sessions (Box office specification, part 3, "A till session", and PAY-03). A seller opens one
// with a float, takes payments in it, and cashes up: counting stops new payments, the cash counted is
// compared with what is expected, and any difference is explained and posted to
// payments.cash-variance. Above payments.sessions.variance-needs-second-person, a second person closes
// a session with a difference.
import { all, first, newId, nowMs, Refusal, useSetting, type UnitView } from '#kit'
import { postEntries } from '#modules/finance'
import { exactAccount, inAccountScope } from './account-scope'
import { labelsOf } from './people'

export interface SessionRow { id: string, point_label: string, opened_by: string, closed_by: string | null, opened_at: number, closed_at: number | null, state: 'open' | 'counting' | 'closed', float_minor: number, expected_cash_minor: number | null, counted_cash_minor: number | null, variance_note: string | null, currency: string }

export async function getSession(id: string): Promise<SessionRow | null> {
  return first<SessionRow>('SELECT * FROM payments_sessions WHERE id = ?', id)
}

/** The person's session not yet closed, if they have one. */
export async function sessionOf(accountId: string): Promise<SessionRow | null> {
  const mine = inAccountScope('opened_by', accountId)
  return first<SessionRow>(`SELECT * FROM payments_sessions WHERE state <> 'closed' AND ${mine.sql} ORDER BY opened_at DESC LIMIT 1`, ...mine.params)
}

/** Expected cash: the float, plus cash taken in the session, less cash handed back from it. */
export async function expectedCash(session: SessionRow): Promise<number> {
  const row = await first<{ taken: number, back: number }>(`SELECT
      (SELECT coalesce(sum(a.amount_minor), 0) FROM payments_attempts a JOIN payments_intents i ON i.id = a.intent_id WHERE i.session_id = ? AND a.method = 'cash' AND a.state = 'succeeded') AS taken,
      (SELECT coalesce(sum(r.amount_minor), 0) FROM payments_refunds r WHERE r.session_id = ? AND r.state = 'succeeded') AS back`, session.id, session.id)
  return session.float_minor + (row?.taken ?? 0) - (row?.back ?? 0)
}

/** Opens a session for the person. Refused while they have another not yet closed. */
export async function openSession(unit: UnitView, input: { accountId: string, pointLabel: string, floatMinor?: number }): Promise<string> {
  if (await sessionOf(input.accountId)) throw new Refusal('payments.session.already-open', 'You already have a till session open.', { status: 409, remedy: 'Cash up that session first.' })
  const float = input.floatMinor ?? await useSetting('payments.sessions.default-float') as number
  if (!Number.isSafeInteger(float) || float < 0) throw new Refusal('payments.session.bad-float', 'The float is a whole amount, nothing or more.', { status: 422, fields: { floatMinor: 'payments.session.bad-float' } })
  const id = newId('till')
  const at = nowMs()
  const currency = await useSetting('core.locale.currency') as string
  // The partial unique index on opened_by refuses a race the read did not see. It compares stored ids,
  // which is why opened_by moves on a merge.
  const own = exactAccount('opened_by', input.accountId) // exact-account: the one-open-session index compares stored ids
  unit.add({
    sql: `INSERT INTO payments_sessions (id, point_label, opened_by, opened_at, state, float_minor, currency, created_at, updated_at)
      SELECT ?, ?, ?, ?, 'open', ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM payments_sessions WHERE state <> 'closed' AND ${own.sql})`,
    params: [id, input.pointLabel, input.accountId, at, float, currency, at, at, ...own.params],
  }).expect(1, { code: 'payments.session.already-open', reason: 'You already have a till session open.' })
  return id
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
  const scope = inAccountScope('opened_by', input.by)
  const own = !!(await first<{ id: string }>(`SELECT id FROM payments_sessions WHERE id = ? AND ${scope.sql}`, session.id, ...scope.params))
  if (!own && !input.canCloseAny) throw new Refusal('core.access.denied', 'Only the person who opened this session, or someone allowed to close any, may close it.', { status: 403 })
  const limit = await useSetting('payments.sessions.variance-needs-second-person') as number
  if (own && Math.abs(variance) > limit) throw new Refusal('payments.session.second-person-needed', 'The difference is above the limit, so someone else must close this session.', { status: 409, remedy: 'Ask someone allowed to close any session to close it.' })

  const at = nowMs()
  unit.add({
    sql: "UPDATE payments_sessions SET state = 'closed', counted_cash_minor = ?, variance_note = ?, closed_by = ?, closed_at = ?, updated_at = ? WHERE id = ? AND state = 'counting'",
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

export interface SessionSummary { id: string, pointLabel: string, openedBy: string, openedByName: string, closedBy: string | null, closedByName: string | null, openedAt: number, closedAt: number | null, state: string, floatMinor: number, expectedCashMinor: number, countedCashMinor: number | null, varianceMinor: number | null, varianceNote: string | null, currency: string }

export async function summarise(session: SessionRow, names?: Map<string, string>): Promise<SessionSummary> {
  const expected = session.expected_cash_minor ?? await expectedCash(session)
  const label = names ?? await labelsOf([session.opened_by, session.closed_by])
  return {
    id: session.id,
    pointLabel: session.point_label,
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

export async function listSessions(limit: number): Promise<SessionSummary[]> {
  const rows = await all<SessionRow>('SELECT * FROM payments_sessions ORDER BY opened_at DESC LIMIT ?', limit)
  const names = await labelsOf(rows.flatMap(r => [r.opened_by, r.closed_by]))
  return Promise.all(rows.map(r => summarise(r, names)))
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
