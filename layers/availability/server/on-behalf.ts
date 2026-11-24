// Entries on someone's behalf (rule A8): a planner marks a member of a group they plan for busy or
// maybe ("phoned in: away 12 March"), never free and never a pattern. The person is told and may change it.
import { sql } from 'drizzle-orm'
import { inAccountScope, refuse, useDb, type Actor, type UnitView } from '#kit'
import { accountLabel, notify } from '#modules/core'
import { createException, entryDates, type ExceptionInput } from './entries'
import { plannable } from './planning'

export interface OnBehalfEntry { id: string, firstDate: string, lastDate: string, weekdays: number[] | null, from: string | null, until: string | null, level: string, reason: string | null }

/** Refused unless the planner plans for a group the person is in; holding find.anyone is not enough. */
async function plansFor(actor: Actor, accountId: string): Promise<void> {
  if (accountId === actor.accountId) refuse('availability.on-behalf.self', 'Use My availability for your own.', { status: 422 })
  if (!(await plannable(actor, { accountIds: [accountId] })).reasons.has(accountId))
    refuse('availability.on-behalf.not-yours', 'You can add an entry only for someone in a group you plan for.', { status: 403 })
}

export async function createOnBehalf(unit: UnitView, actor: Actor, accountId: string, e: ExceptionInput): Promise<string> {
  if (e.level === 'free') refuse('availability.on-behalf.level', 'Only busy or maybe can be entered for someone else.', { status: 422 })
  await plansFor(actor, accountId)
  const id = await createException(unit, accountId, actor.accountId!, { ...e, reasonShared: false })
  const dates = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }) // not-policy: wording of the notice
  const at = (d: string) => dates.format(Date.parse(`${d}T12:00:00Z`))
  const period = e.firstDate === e.lastDate ? at(e.firstDate) : `${at(e.firstDate)} to ${at(e.lastDate)}`
  await notify(unit, 'availability.entry-added-for-you', { to: [{ accountId, variables: { planner: await accountLabel(actor.accountId!), period, level: e.level }, dedupeKey: `on-behalf:${id}` }] })
  return id
}

/** What this planner added for the person, today onwards, for the planner to check or remove. */
export async function addedFor(actor: Actor, accountId: string): Promise<OnBehalfEntry[]> {
  await plansFor(actor, accountId)
  const { today } = await entryDates()
  const rows = await useDb().all<{ id: string, first_date: string, last_date: string, weekdays: string | null, from_local: string | null, until_local: string | null, level: string, reason: string | null }>(
    sql`SELECT id, first_date, last_date, weekdays, from_local, until_local, level, reason FROM availability_exceptions
      WHERE ${inAccountScope('account_id', accountId)} AND ${inAccountScope('entered_by', actor.accountId!)} AND last_date >= ${today} ORDER BY first_date, created_at`)
  return rows.map(r => ({ id: r.id, firstDate: r.first_date, lastDate: r.last_date, weekdays: r.weekdays ? JSON.parse(r.weekdays) as number[] : null, from: r.from_local, until: r.until_local, level: r.level, reason: r.reason }))
}
