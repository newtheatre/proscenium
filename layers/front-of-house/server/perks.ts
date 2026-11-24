// T-shirts and meals for a crew call (FH-50; CC3, CC4, HO1, HO2). What a person has earned is worked
// out when asked, from their assignments on the call's shifts and their answers to its questions;
// only a handout is stored. Dietary needs are special-category answers: counted for crew-call.manage,
// named only under crew-call.view-needs.
import { all, first, localDate, newId, nowMs, ownRecordExempt, refuse, theatreTimeZone, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { slotAnswers, slotQuestions, type KeyedAnswer, type SlotQuestion } from '#modules/forms'
import { CREW_SLOT, requireCrewCall, type CrewCall, type QuestionRoles } from './crew-calls'

/** Assignment states that count toward a perk: confirmed, or worked. */
const COUNTED = ['confirmed', 'release_requested', 'checked_in', 'worked'].map(s => `'${s}'`).join(', ')
const MINUTE = 60_000 // not-policy: unit conversion
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
/** Below this many people a need is shown as "fewer than 3", so a count singles nobody out. */
export const SMALL_COUNT = 3 // not-policy: the spec's disclosure floor, not a theatre's choice

export type Item = 'tshirt' | 'meal'

/** The template's keys, used when a call has not said which question is which. */
const TEMPLATE_ROLES: Required<QuestionRoles> = { tshirtSize: 't_shirt', mealDays: 'meal_days', dietaryNeed: 'dietary' }

export function rolesOf(call: CrewCall, questions: SlotQuestion[]): QuestionRoles {
  const has = (key?: string) => key && questions.some(q => q.key === key) ? key : undefined
  return {
    tshirtSize: has(call.questionRoles.tshirtSize ?? TEMPLATE_ROLES.tshirtSize),
    mealDays: has(call.questionRoles.mealDays ?? TEMPLATE_ROLES.mealDays),
    dietaryNeed: has(call.questionRoles.dietaryNeed ?? TEMPLATE_ROLES.dietaryNeed),
  }
}

export interface Standing { id: string, accountId: string, item: Item, day: string | null, size: string | null, handedBy: string, at: number }

/** Handouts that stand: not undone, and not themselves an undo. */
export async function standingHandouts(callId: string, accountId?: string): Promise<Standing[]> {
  const rows = await all<{ id: string, account_id: string, item: Item, day: string | null, size: string | null, handed_by: string, created_at: number }>(
    `SELECT h.id, h.account_id, h.item, h.day, h.size, h.handed_by, h.created_at FROM front_of_house_handouts h
      WHERE h.crew_call_id = ?1 AND h.reverses_id IS NULL AND NOT EXISTS (SELECT 1 FROM front_of_house_handouts u WHERE u.reverses_id = h.id)
        ${accountId ? `AND h.account_id IN (${accountScopeSql('?2')})` : ''} ORDER BY h.created_at -- not-policy: numbered parameters`,
    ...(accountId ? [callId, accountId] : [callId]))
  return rows.map(r => ({ id: r.id, accountId: r.account_id, item: r.item, day: r.day, size: r.size, handedBy: r.handed_by, at: r.created_at }))
}

/** Words for a choice answer: each option's label, and the "Other" text. */
function chosen(answer: KeyedAnswer | undefined, question: SlotQuestion | undefined): string[] {
  if (!answer || answer.value === null || answer.value === undefined) return []
  const ids = Array.isArray(answer.value) ? answer.value.map(String) : [String(answer.value)]
  const words = ids.map(id => question?.options.find(o => o.id === id)?.label ?? id)
  return answer.other ? [...words.filter(w => w.toLowerCase() !== 'other'), answer.other] : words
}

/** Whether a meal-days answer asks for this local date: by weekday name, or by the date itself. */
function asksFor(days: string[], day: string): boolean {
  const weekday = WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]!
  return days.some(d => d.toLowerCase() === weekday || d === day)
}

export interface Entitlement {
  accountId: string
  shifts: number
  answered: boolean
  tshirt: boolean
  size: string | null
  /** Local dates on which a meal is earned. */
  mealDays: string[]
  /** Only when needs were asked for (a count, or view-needs). */
  needs: string[]
}

/** What each person on the call has earned (CC3). `needs` opens the dietary answers. */
export async function entitlements(call: CrewCall, options: { needs: boolean }): Promise<Map<string, Entitlement>> {
  const rows = await all<{ account_id: string, call_at: number, ends_at: number, minutes_worked: number | null, state: string }>(
    `SELECT a.account_id, s.call_at, s.ends_at, a.minutes_worked, a.state FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
      WHERE s.crew_call_id = ? AND s.state <> 'cancelled' AND a.state IN (${COUNTED})`, call.id)
  const questions = await slotQuestions(CREW_SLOT, call.id)
  const roles = rolesOf(call, questions)
  const keys = [roles.tshirtSize, roles.mealDays, ...(options.needs ? [roles.dietaryNeed] : [])].filter((k): k is string => !!k)
  const answers = await slotAnswers(CREW_SLOT, call.id, keys, { special: options.needs })
  const question = (key?: string) => questions.find(q => q.key === key)
  const out = new Map<string, Entitlement>()
  const minutes = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const e = out.get(r.account_id) ?? { accountId: r.account_id, shifts: 0, answered: answers.has(r.account_id), tshirt: false, size: null, mealDays: [], needs: [] }
    e.shifts++
    out.set(r.account_id, e)
    const day = await localDate(r.call_at)
    const worked = r.state === 'worked' && r.minutes_worked !== null ? r.minutes_worked : Math.round((r.ends_at - r.call_at) / MINUTE)
    const perDay = minutes.get(r.account_id) ?? new Map<string, number>()
    perDay.set(day, (perDay.get(day) ?? 0) + worked)
    minutes.set(r.account_id, perDay)
  }
  for (const e of out.values()) {
    const a = answers.get(e.accountId) ?? {}
    e.size = chosen(a[roles.tshirtSize ?? ''], question(roles.tshirtSize))[0] ?? null
    e.tshirt = call.tshirtMinShifts !== null && e.shifts >= call.tshirtMinShifts
    const asked = chosen(a[roles.mealDays ?? ''], question(roles.mealDays))
    if (call.mealMinMinutes !== null) {
      for (const [day, total] of minutes.get(e.accountId) ?? []) {
        if (total >= call.mealMinMinutes && (!call.mealsOnRequest || asksFor(asked, day))) e.mealDays.push(day)
      }
      e.mealDays.sort()
    }
    if (options.needs) e.needs = chosen(a[roles.dietaryNeed ?? ''], question(roles.dietaryNeed))
  }
  return out
}

export interface PerkCounts {
  tshirts: { size: string | null, earned: number, handed: number, toHand: number }[]
  /** Handed out to someone who had not earned it yet (HO2). */
  tshirtsEarly: number
  meals: { day: string, earned: number, handed: number, needs: { need: string, count: number | null }[] }[]
  mealsEarly: number
}

/** The Perks tab's counts (CC4). A need with fewer than three people reads null: "fewer than 3". */
export async function perkCounts(callId: string): Promise<PerkCounts & { roles: QuestionRoles, questions: SlotQuestion[] }> {
  const call = await requireCrewCall(callId)
  const people = await entitlements(call, { needs: true })
  const handed = await standingHandouts(call.id)
  const shirts = handed.filter(h => h.item === 'tshirt')
  const sizes = new Map<string | null, { earned: number, handed: number, toHand: number }>()
  const row = (size: string | null) => sizes.get(size) ?? sizes.set(size, { earned: 0, handed: 0, toHand: 0 }).get(size)!
  for (const e of people.values()) {
    if (!e.tshirt) continue
    row(e.size).earned++
    if (!shirts.some(h => h.accountId === e.accountId)) row(e.size).toHand++
  }
  for (const h of shirts) row(h.size ?? people.get(h.accountId)?.size ?? null).handed++
  const meals: PerkCounts['meals'] = []
  for (const day of daysOf(call)) {
    const earners = [...people.values()].filter(e => e.mealDays.includes(day))
    const tally = new Map<string, number>()
    for (const e of earners) for (const need of e.needs) tally.set(need, (tally.get(need) ?? 0) + 1)
    meals.push({
      day,
      earned: earners.length,
      handed: handed.filter(h => h.item === 'meal' && h.day === day).length,
      needs: [...tally].sort(([a], [b]) => a.localeCompare(b)).map(([need, count]) => ({ need, count: count < SMALL_COUNT ? null : count })),
    })
  }
  const questions = await slotQuestions(CREW_SLOT, call.id)
  return {
    tshirts: [...sizes].map(([size, c]) => ({ size, ...c })).sort((a, b) => (a.size ?? '~').localeCompare(b.size ?? '~')),
    tshirtsEarly: shirts.filter(h => !people.get(h.accountId)?.tshirt).length,
    meals,
    mealsEarly: handed.filter(h => h.item === 'meal' && !people.get(h.accountId)?.mealDays.includes(h.day!)).length,
    roles: rolesOf(call, questions),
    questions,
  }
}

function daysOf(call: CrewCall): string[] {
  const out: string[] = []
  for (let d = new Date(`${call.startsOn}T12:00:00Z`); d.toISOString().slice(0, 10) <= call.endsOn; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10)) // not-policy: a date's length
  return out
}

const ALREADY = { code: 'front-of-house.handout.already', reason: 'Someone has just handed this out.', remedy: 'Look at what they have had before handing out another.' }

/**
 * Records a handout once per call, person, item and day (HO1): the insert's own predicate is the
 * guard, so two at once give one row. One already standing is refused naming who and when. A
 * handout to someone who has not earned it goes ahead and says so (HO2).
 */
export async function recordHandout(unit: UnitView, input: { callId: string, accountId: string, item: Item, day?: string | null, size?: string | null, by: Actor }, nameOf: (id: string) => Promise<string>): Promise<{ handoutId: string, earned: boolean }> {
  const call = await requireCrewCall(input.callId)
  // Nobody hands themselves a T-shirt; the Owner stands above the rule, as elsewhere.
  if (input.accountId === input.by.accountId && !(await ownRecordExempt(input.by)))
    refuse('core.access.own-record', 'You cannot hand a perk to yourself.', { status: 403, remedy: 'Ask someone else on the crew to record it.' }) // not-policy: HTTP status
  if (call.state === 'draft' || call.state === 'archived') refuse('front-of-house.handout.call-not-running', 'Handouts are recorded while a crew call is open or closed.', { remedy: 'Open the crew call first.' })
  const day = input.item === 'meal' ? input.day ?? null : null
  if (input.item === 'meal' && (!day || day < call.startsOn || day > call.endsOn))
    refuse('front-of-house.handout.day', 'A meal is handed out on one of the crew call\'s days.', { status: 422, fields: { day: 'Choose a day of the crew call.' } }) // not-policy: HTTP status
  const standing = (await standingHandouts(call.id, input.accountId)).find(h => h.item === input.item && h.day === day)
  if (standing) refuse('front-of-house.handout.already', `Already handed out by ${await nameOf(standing.handedBy)} at ${await clock(standing.at)}.`, { remedy: 'Undo that one first if it was a mistake.' })
  const person = (await entitlements(call, { needs: false })).get(input.accountId)
  const earned = input.item === 'tshirt' ? !!person?.tshirt : !!person?.mealDays.includes(day!)
  const size = input.item === 'tshirt' ? (input.size ?? person?.size ?? null) : null
  const id = newId('hnd')
  unit.add({
    sql: `INSERT INTO front_of_house_handouts (id, crew_call_id, account_id, item, day, size, handed_by, created_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE NOT EXISTS (SELECT 1 FROM front_of_house_handouts h -- not-policy: numbered parameters
        WHERE h.crew_call_id = ?2 AND h.account_id IN (${accountScopeSql('?3')}) AND h.item = ?4 AND h.day IS ?5 AND h.reverses_id IS NULL -- not-policy: numbered parameters
          AND NOT EXISTS (SELECT 1 FROM front_of_house_handouts u WHERE u.reverses_id = h.id))`,
    params: [id, call.id, input.accountId, input.item, day, size, input.by.accountId, nowMs()],
  }).expect(1, ALREADY)
  unit.audit({ action: 'create', record: ['front-of-house.crew-call', call.id], detail: { handout: id, item: input.item, earned } })
  unit.announce('front-of-house.handout.recorded', { handoutId: id, crewCallId: call.id, accountId: input.accountId, item: input.item }, { record: ['front-of-house.crew-call', call.id] })
  return { handoutId: id, earned }
}

async function clock(at: number): Promise<string> {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: await theatreTimeZone() }).format(at)
}

/** Undoes a standing handout with a reversing row; the unique index on reverses_id refuses a second undo. */
export async function undoHandout(unit: UnitView, input: { callId: string, handoutId: string, by: string }): Promise<void> {
  const row = await first<{ id: string, account_id: string, item: Item, day: string | null, reverses_id: string | null }>(
    'SELECT id, account_id, item, day, reverses_id FROM front_of_house_handouts WHERE id = ? AND crew_call_id = ?', input.handoutId, input.callId)
  if (!row || row.reverses_id) refuse('core.not-found', 'There is no such handout.', { status: 404 }) // not-policy: HTTP status
  unit.add({
    sql: `INSERT INTO front_of_house_handouts (id, crew_call_id, account_id, item, day, reverses_id, handed_by, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM front_of_house_handouts WHERE reverses_id = ?)`,
    params: [newId('hnd'), input.callId, row.account_id, row.item, row.day, row.id, input.by, nowMs(), row.id],
  }).expect(1, { code: 'front-of-house.handout.already-undone', reason: 'This handout has already been undone.' })
  unit.audit({ action: 'update', record: ['front-of-house.crew-call', input.callId], detail: { handout: row.id, undone: true } })
}

export interface HandoutPerson extends Entitlement { name: string, handed: Standing[] }

/** The people of a call with what they have earned and had, for the handouts page and "Show list". */
export async function handoutPeople(callId: string, options: { needs: boolean }, nameOf: (id: string) => Promise<string>): Promise<HandoutPerson[]> {
  const call = await requireCrewCall(callId)
  const people = await entitlements(call, { needs: options.needs })
  const handed = await standingHandouts(call.id)
  const out = await Promise.all([...people.values()].map(async e => ({ ...e, needs: options.needs ? e.needs : [], name: await nameOf(e.accountId), handed: handed.filter(h => h.accountId === e.accountId) })))
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
