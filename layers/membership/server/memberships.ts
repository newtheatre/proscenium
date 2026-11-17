// Holding a scheme (Membership specification, tab 3, D1 to D4 and A1 to A3). Whether a membership
// is current is read from its state and dates at each request and never stored, so the members'
// area cannot outlive it and nothing has to run when it lapses.
import { all, first, newId, nowMs, useSetting, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { Refusal } from '#kit/refusal'
import { today as theatreToday } from '#kit'
import { endsOnFor, derivedStatus, type DerivedStatus } from './dates'
import type { Scheme } from './schemes'

/** Today in the theatre, or null before setup has set the time zone (when nobody can hold a scheme). */
export async function todayOrNull(): Promise<string | null> {
  try {
    return await theatreToday()
  }
  catch (error) {
    if (error instanceof Refusal) return null
    throw error
  }
}

// D1 and D4 as SQL: active, started, and not past the end plus the scheme's grace. ?2 is today.
const CURRENT = 'm.state = \'active\' AND m.starts_on <= ?2 AND (m.ends_on IS NULL OR date(m.ends_on, \'+\' || s.grace_days || \' days\') >= ?2)'

export interface CurrentMembership {
  id: string
  schemeId: string
  side: 'members' | 'audience'
  startsOn: string
  endsOn: string | null
  status: DerivedStatus
}

/** The account's current memberships, in grace included (D4: two of one scheme both appear). */
export async function currentMemberships(accountId: string, on?: string): Promise<CurrentMembership[]> {
  const day = on ?? await todayOrNull()
  if (!day) return []
  const rows = await all<{ id: string, scheme_id: string, side: 'members' | 'audience', starts_on: string, ends_on: string | null, grace_days: number }>(
    `SELECT m.id, m.scheme_id, s.side, m.starts_on, m.ends_on, s.grace_days FROM membership_memberships m
       JOIN membership_schemes s ON s.id = m.scheme_id
      WHERE m.account_id IN (${accountScopeSql('?1')}) AND ${CURRENT}
      ORDER BY m.starts_on, m.id`,
    accountId, day,
  )
  return rows.map(r => ({ id: r.id, schemeId: r.scheme_id, side: r.side, startsOn: r.starts_on, endsOn: r.ends_on, status: derivedStatus({ startsOn: r.starts_on, endsOn: r.ends_on }, r.grace_days, day) }))
}

/** Whether the account holds a scheme on the given side now: membership.holder and membership.supporter. */
export async function holdsSide(accountId: string, side: 'members' | 'audience'): Promise<boolean> {
  const day = await todayOrNull()
  if (!day) return false
  return !!(await first(
    `SELECT 1 FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id WHERE m.account_id IN (${accountScopeSql('?1')}) AND m.realm = ?3 AND ${CURRENT} LIMIT 1`,
    accountId, day, side,
  ))
}

/**
 * A voting member's memberships: current ones of a voting scheme, with how long each has run without a
 * break, counted from the first activation in its chain of renewals, so renewing never resets the
 * qualifying period while lapsing and coming back does.
 */
const VOTING_SINCE = `WITH RECURSIVE chain(start_id, id, renews_id, activated_at) AS (
    SELECT m.id, m.id, m.renews_id, m.activated_at FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id
     WHERE s.voting = 1 AND ${CURRENT} AND m.account_id IN (SCOPE)
    UNION ALL
    SELECT c.start_id, p.id, p.renews_id, p.activated_at FROM chain c JOIN membership_memberships p ON p.id = c.renews_id WHERE p.activated_at IS NOT NULL
  )`

/** membership.voter: a current membership of a voting scheme, held without a break for the qualifying period. */
export async function votes(accountId: string): Promise<boolean> {
  const day = await todayOrNull()
  if (!day) return false
  const period = Number(await useSetting('membership.voting.qualifying-period') ?? 0) * 1000 // not-policy: seconds to milliseconds
  const row = await first<{ since: number | null }>(
    `${VOTING_SINCE.replace('SCOPE', accountScopeSql('?1'))} SELECT min(since) AS since FROM (SELECT start_id, min(activated_at) AS since FROM chain GROUP BY start_id)`,
    accountId, day,
  )
  return row?.since != null && row.since <= nowMs() - period
}

/** Everybody membership.voter holds for now, as survivors. */
export async function voters(): Promise<string[]> {
  const day = await todayOrNull()
  if (!day) return []
  const period = Number(await useSetting('membership.voting.qualifying-period') ?? 0) * 1000 // not-policy: seconds to milliseconds
  const rows = await all<{ id: string }>(
    `WITH RECURSIVE chain(account_id, start_id, id, renews_id, activated_at) AS (
        SELECT coalesce(a.merged_into_id, a.id), m.id, m.id, m.renews_id, m.activated_at FROM membership_memberships m
          JOIN membership_schemes s ON s.id = m.scheme_id JOIN core_accounts a ON a.id = m.account_id
         WHERE s.voting = 1 AND ${CURRENT}
        UNION ALL
        SELECT c.account_id, c.start_id, p.id, p.renews_id, p.activated_at FROM chain c JOIN membership_memberships p ON p.id = c.renews_id WHERE p.activated_at IS NOT NULL
      )
      SELECT DISTINCT account_id AS id FROM (SELECT account_id, start_id, min(activated_at) AS since FROM chain GROUP BY account_id, start_id) WHERE since <= ?1 ORDER BY 1`,
    nowMs() - period, day,
  )
  return rows.map(r => r.id)
}

/** Rule D4 for one scheme. */
export async function holdsScheme(accountId: string, schemeId: string, on?: string): Promise<boolean> {
  const day = on ?? await todayOrNull()
  if (!day) return false
  return !!(await first(
    `SELECT 1 FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id WHERE m.account_id IN (${accountScopeSql('?1')}) AND m.scheme_id = ?3 AND ${CURRENT} LIMIT 1`,
    accountId, day, schemeId,
  ))
}

/** Everybody holding a side, or one scheme, now. Survivors only: a merged account's rows count for its survivor. */
export async function holders(filter: { side: 'members' | 'audience' } | { schemeId: string }): Promise<string[]> {
  const day = await todayOrNull()
  if (!day) return []
  const [condition, value] = 'side' in filter ? ['m.realm = ?1', filter.side] : ['m.scheme_id = ?1', filter.schemeId]
  const rows = await all<{ id: string }>(
    `SELECT DISTINCT coalesce(a.merged_into_id, a.id) AS id FROM membership_memberships m
       JOIN membership_schemes s ON s.id = m.scheme_id
       JOIN core_accounts a ON a.id = m.account_id
      WHERE ${condition} AND ${CURRENT} ORDER BY 1`,
    value, day,
  )
  return rows.map(r => r.id)
}

export interface ActiveInput {
  scheme: Scheme
  accountId: string
  origin: 'applied' | 'added' | 'renewed' | 'action'
  lengthOptionId: string | null
  /** For the option chosen: scheme years or months. */
  count: number
  startsOn: string
  /** Set by hand by staff (D7), or from a list entry (D9). Otherwise the scheme's rule decides. */
  endsOn?: string | null
  addedBy?: string | null
  note?: string | null
  /** The membership this renews (R1). */
  renewsId?: string | null
}

/**
 * Writes an active membership with its dates (D5, D6) into the caller's unit, the person's member
 * number if this is their first (A3), and announces the start (A4). Nothing is checked or paid,
 * so this is for a scheme with nothing outstanding, or staff adding a member (G2).
 */
export async function writeActive(unit: UnitView, input: ActiveInput): Promise<{ membershipId: string, startsOn: string, endsOn: string | null }> {
  const at = nowMs()
  const id = newId('mshp')
  const endsOn = input.endsOn !== undefined ? input.endsOn : endsOnFor(input.scheme, input.startsOn, input.count)
  unit.add({
    sql: `INSERT INTO membership_memberships (id, account_id, scheme_id, length_option_id, realm, state, origin, renews_id, starts_on, ends_on,
            needs_verification, needs_approval, needs_payment, activated_at, added_by, note, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?)`,
    params: [id, input.accountId, input.scheme.id, input.lengthOptionId, input.scheme.side, input.origin, input.renewsId ?? null, input.startsOn, endsOn, at, input.addedBy ?? null, input.note ?? null, at, at],
  }).expect(1)
  writeNumber(unit, input.accountId, input.startsOn, at)
  unit.announce('membership.membership.started', { membershipId: id, schemeId: input.scheme.id, accountId: input.accountId }, { record: ['membership.membership', id] })
  return { membershipId: id, startsOn: input.startsOn, endsOn }
}

/**
 * A3: the number is one more than the highest, read and written in one statement; the unique index
 * settles a race. A person who has ever held a membership keeps theirs. The aggregate sits in a
 * subquery because an aggregate always yields a row, which would otherwise issue number 1 again.
 */
export function writeNumber(unit: UnitView, accountId: string, startsOn: string, at: number): void {
  unit.add({
    sql: `INSERT INTO membership_members (id, account_id, number, first_joined_on, created_at) SELECT ?1, ?2, n, ?3, ?4 FROM (SELECT coalesce(max(number), 0) + 1 AS n FROM membership_members) WHERE NOT EXISTS (SELECT 1 FROM membership_members WHERE account_id IN (${accountScopeSql('?2')}))`,
    params: [newId('mbr'), accountId, startsOn, at],
  })
}

/**
 * An application (V2, V3, P1): pending, with what is outstanding. By default it waits on staff to
 * check it. One that has passed its check and waits only for its fee is `verified` and `paying`, and
 * expires at `expiresAt` because the next step is the applicant's (J5).
 */
export function writePending(unit: UnitView, input: { scheme: Scheme, accountId: string, lengthOptionId: string | null, renewsId?: string | null, verified?: boolean, paying?: boolean, expiresAt?: number | null }): string {
  const at = nowMs()
  const id = newId('mshp')
  unit.add({
    sql: `INSERT INTO membership_memberships (id, account_id, scheme_id, length_option_id, realm, state, origin, renews_id, needs_verification, needs_approval, needs_payment, verified_at, expires_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    params: [id, input.accountId, input.scheme.id, input.lengthOptionId, input.scheme.side, input.renewsId ? 'renewed' : 'applied', input.renewsId ?? null, input.verified ? 0 : 1, input.paying ? 1 : 0, input.verified ? at : null, input.expiresAt ?? null, at, at],
  }).expect(1)
  return id
}

/**
 * Activates a pending application whose last requirement has just been met (A1): its dates are set
 * now, from the day it activates. The check constraint refuses it while anything is outstanding.
 */
export function activatePending(unit: UnitView, input: { id: string, scheme: Scheme, accountId: string, count: number, startsOn: string, endsOn?: string | null, paid?: boolean }): { startsOn: string, endsOn: string | null } {
  const at = nowMs()
  const endsOn = input.endsOn !== undefined ? input.endsOn : endsOnFor(input.scheme, input.startsOn, input.count)
  unit.add({
    // D9: an end date from a list entry leaves the membership without a length option.
    sql: `UPDATE membership_memberships SET state = 'active', starts_on = ?, ends_on = ?, verified_at = coalesce(verified_at, ?), activated_at = ?, expires_at = NULL, updated_at = ?${input.paid ? ', paid_at = ?' : ''}${input.endsOn !== undefined ? ', length_option_id = NULL' : ''} WHERE id = ? AND state = 'pending'`,
    params: [input.startsOn, endsOn, at, at, at, ...(input.paid ? [at] : []), input.id],
  }).expect(1, { code: 'membership.application.changed', reason: 'This application has already been dealt with.', remedy: 'Reload the page.' })
  writeNumber(unit, input.accountId, input.startsOn, at)
  unit.announce('membership.membership.started', { membershipId: input.id, schemeId: input.scheme.id, accountId: input.accountId }, { record: ['membership.membership', input.id] })
  return { startsOn: input.startsOn, endsOn }
}

/** The person's member number, shown with the theatre's prefix. Null before their first membership. */
export async function memberNumber(accountId: string): Promise<{ number: number, label: string, since: string } | null> {
  // After a merge both accounts' rows may be in scope (rule X2): the lower number and the earlier date count.
  const row = await first<{ number: number | null, first_joined_on: string }>(
    `SELECT min(number) AS number, min(first_joined_on) AS first_joined_on FROM membership_members WHERE account_id IN (${accountScopeSql('?1')})`,
    accountId,
  )
  if (!row?.number) return null
  return { number: row.number, label: `${await useSetting('membership.numbers.prefix') ?? ''}${row.number}`, since: row.first_joined_on }
}
