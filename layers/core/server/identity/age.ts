// Under 18 (C-74, ruling R3-25): identity keeps only the day a person under 18 turns 18, told by the
// person or recorded by staff who have seen ID, and deletes it once it passes. Modules ask
// ageStatus and get 'under-18' or 'unknown'; unknown is never taken to mean adult.
import { all, first, nowMs, refuse, today, useSetting, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'

export type AgeStatus = 'under-18' | 'unknown'
export type AgeSource = 'self' | 'staff'

const DATE = /^\d{4}-\d{2}-\d{2}$/ // not-policy: the shape of a date

/** The theatre's today, or null before setup has set its time zone, when nothing can be recorded. */
async function todayIfSet(): Promise<string | null> {
  return (await useSetting('core.locale.time-zone')) ? today() : null
}

/** The marker on the person behind this account, whichever of their merged ids holds it. */
async function markerOf(accountId: string): Promise<{ turns_18_on: string, source: AgeSource } | null> {
  return first<{ turns_18_on: string, source: AgeSource }>(
    `SELECT turns_18_on, source FROM core_age_markers WHERE account_id IN (${accountScopeSql('?1')}) ORDER BY turns_18_on DESC LIMIT 1`,
    accountId,
  )
}

/**
 * Whether the person is under 18 on a date (the theatre's today if none is given): 'under-18' when
 * a recorded day they turn 18 is still to come on that date, otherwise 'unknown'.
 */
export async function ageStatus(accountId: string, on?: string): Promise<AgeStatus> {
  const marker = await markerOf(accountId)
  const day = on ?? await todayIfSet()
  return marker && day && marker.turns_18_on > day ? 'under-18' : 'unknown'
}

/** The same for many people at once, for a rota or a team list; each id answers. */
export async function ageStatuses(accountIds: string[], on?: string): Promise<Map<string, AgeStatus>> {
  const day = on ?? await todayIfSet()
  const out = new Map<string, AgeStatus>(accountIds.map(id => [id, 'unknown']))
  if (!day) return out
  const ids = [...new Set(accountIds)]
  for (let i = 0; i < ids.length; i += 90) { // not-policy: D1's bound-parameter limit
    const chunk = ids.slice(i, i + 90) // not-policy: D1's bound-parameter limit
    // Each asked id against the markers of every account merged with it.
    const rows = await all<{ asked: string }>(
      `SELECT a.id AS asked FROM core_accounts a
         JOIN core_accounts held ON coalesce(held.merged_into_id, held.id) = coalesce(a.merged_into_id, a.id)
         JOIN core_age_markers m ON m.account_id = held.id
        WHERE a.id IN (${chunk.map(() => '?').join(', ')}) AND m.turns_18_on > ?`,
      ...chunk, day,
    )
    for (const row of rows) out.set(row.asked, 'under-18')
  }
  return out
}

/** What the person, or staff with core.age.record, see: the day and who recorded it. */
export async function ageMarkerFor(accountId: string): Promise<{ turns18On: string, source: AgeSource } | null> {
  const marker = await markerOf(accountId)
  const day = await todayIfSet()
  return marker && day && marker.turns_18_on > day ? { turns18On: marker.turns_18_on, source: marker.source } : null
}

/**
 * The day must be after today and no further off than the youngest a person may be to hold an
 * account allows (core.accounts.minimum-age), a year's grace included.
 */
async function checkDay(turns18On: string): Promise<void> {
  const day = await today()
  const minimum = await useSetting('core.accounts.minimum-age') as number
  const latest = `${Number(day.slice(0, 4)) + (18 - minimum) + 1}${day.slice(4)}` // not-policy: 18 is the age the marker is about
  if (!DATE.test(turns18On) || Number.isNaN(Date.parse(turns18On)))
    refuse('core.age.bad-date', 'That is not a date.', { status: 422, fields: { turns18On: 'Give the date as a day, month and year.' } })
  if (turns18On <= day)
    refuse('core.age.not-under-18', 'That date has passed, so they are 18 already.', { status: 422, fields: { turns18On: 'Give a date still to come.' } })
  if (turns18On > latest)
    refuse('core.age.too-far', 'That date is too far off for someone old enough to hold an account.', { status: 422, fields: { turns18On: 'Check the year.' } })
}

/**
 * Records or clears the day the person turns 18. The person may change or clear only what they
 * told us themselves; staff who have seen ID may change either. Clearing writes nothing new.
 */
export async function setAgeMarker(unit: UnitView, actor: Actor, accountId: string, turns18On: string | null, source: AgeSource): Promise<void> {
  const before = await markerOf(accountId)
  if (source === 'self' && before?.source === 'staff')
    refuse('core.age.recorded-by-staff', 'This was recorded by the theatre after seeing ID.', { status: 409, remedy: 'Ask the theatre to change it.' })
  if (turns18On !== null) await checkDay(turns18On)
  unit.add({ sql: `DELETE FROM core_age_markers WHERE account_id IN (${accountScopeSql('?1')})`, params: [accountId] })
  if (turns18On !== null) {
    unit.add({
      sql: 'INSERT INTO core_age_markers (account_id, turns_18_on, source, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?)',
      params: [accountId, turns18On, source, actor.accountId ?? null, nowMs()],
    })
  }
  // The audit says that it changed, never the date.
  unit.audit({ action: 'update', record: ['core.account', accountId], detail: { ageMarker: turns18On === null ? 'cleared' : 'recorded', source } })
}

/** Daily: forget the day once it has come, so nothing about age stays on an adult. */
export async function sweepAgeMarkers(unit: UnitView): Promise<void> {
  const day = await todayIfSet()
  if (day) unit.add({ sql: 'DELETE FROM core_age_markers WHERE turns_18_on <= ?', params: [day] })
}
