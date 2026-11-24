// Calls (spec part 3, rules D1, D2 and D4): when the company is in the building. A call stays inside one
// operating day, never overlaps another of the engagement's in its space, and only warns of a performance
// or closure there; a change once the engagement is confirmed tells the contacts.
import { z } from 'zod'
import { all, first, newId, nowMs, refuse } from '#kit'
import type { Actor, UnitOfWork } from '#kit'
import { dayBounds, isSpaceFree, listVenues, notify, operatingDayOf } from '#modules/core'
import { CALL_KINDS, LIMITS } from '../shared/companies'
import type { CallRow, PersonRow } from '../shared/views'
import type { Engagement } from './engagements'

const BATCH_MS = 5 * 60_000 // not-policy: D4's five minutes, fixed by the specification

export const callInput = z.object({
  kind: z.enum(CALL_KINDS),
  spaceId: z.string().min(1).nullable().optional(),
  startsAt: z.number().int(),
  endsAt: z.number().int(),
  label: z.string().trim().max(LIMITS.callLabel).transform(v => v || null).nullable().optional(),
  notes: z.string().trim().max(LIMITS.callNotes).transform(v => v || null).nullable().optional(),
}).refine(c => c.endsAt > c.startsAt, { path: ['endsAt'], message: 'End after it starts.' })
  .refine(c => c.kind !== 'other' || !!c.label, { path: ['label'], message: 'Say what the call is for.' })

export interface Step { unit: UnitOfWork, actor: Actor, engagement: Engagement }

const NO_CALL = { code: 'core.not-found', reason: 'There is no such call.', remedy: 'Reload the page.' }
const OVERLAP = { code: 'companies.call.overlap', reason: 'Another call of this engagement is in that space at that time.', remedy: 'Change the times, or the other call.' }

/** Rule D1: inside one operating day (04:00 to 04:00), refused before the write. */
async function checkDay(input: { startsAt: number, endsAt: number }): Promise<void> {
  const { end } = await dayBounds(await operatingDayOf(input.startsAt))
  if (input.endsAt > end) refuse('companies.call.crosses-day', 'A call must end by the end of its operating day.', { status: 422, remedy: 'Split it into two calls, one each side of the day\'s end.', fields: { endsAt: 'End by the end of the day.' } })
}

/** Rule D2: what is already in the space then, said as a warning and never refused. */
async function warnings(input: { spaceId?: string | null, startsAt: number, endsAt: number }): Promise<string[]> {
  if (!input.spaceId || await isSpaceFree(input.spaceId, input.startsAt, input.endsAt)) return []
  return ['Something else is in that space at that time: a performance, a closure or a booking. The call is saved anyway.']
}

const overlapGuard = (spaceId: string | null | undefined, except: string | null) => ({
  sql: 'NOT EXISTS (SELECT 1 FROM companies_calls o WHERE o.engagement_id = ? AND o.space_id IS ? AND o.space_id IS NOT NULL AND o.starts_at < ? AND o.ends_at > ? AND o.id IS NOT ?)',
  params: (engagementId: string, startsAt: number, endsAt: number) => [engagementId, spaceId ?? null, endsAt, startsAt, except],
})

/** Rule D4: after confirmation, the contacts who receive the schedule are told once for the changes of five minutes. */
async function tellContacts({ unit, engagement }: Step, callId: string): Promise<void> {
  unit.announce('companies.call.changed', { engagementId: engagement.id, callId }, { record: ['companies.engagement', engagement.id] })
  if (engagement.state !== 'confirmed') return
  const contacts = await all<{ account_id: string }>('SELECT account_id FROM companies_contacts k WHERE company_id = ? AND ended_at IS NULL AND EXISTS (SELECT 1 FROM json_each(k.receives) r WHERE r.value = \'schedule\')', engagement.companyId)
  if (!contacts.length) return
  await notify(unit, 'companies.schedule-changed', {
    to: contacts.map(c => c.account_id),
    variables: { title: engagement.title },
    subject: ['companies.engagement', engagement.id],
    dedupeKey: `companies:schedule:${engagement.id}:${Math.floor(nowMs() / BATCH_MS)}`,
  })
}

export function refuseClosed(engagement: Engagement): void {
  if (['cancelled', 'settled'].includes(engagement.state)) refuse('companies.engagement.wrong-state', `This engagement is ${engagement.state}.`, { status: 409, remedy: 'Open a new engagement instead.' })
}

export function history(step: Step, kind: 'call-changed' | 'people-changed', detail: Record<string, string>): void {
  const at = nowMs()
  step.unit.add({
    sql: 'INSERT INTO companies_engagement_events (id, engagement_id, kind, detail, actor_id, at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    params: [newId('cpev'), step.engagement.id, kind, JSON.stringify(detail), step.actor.accountId ?? null, at, at],
  })
}

async function requireCall(callId: string, engagementId: string): Promise<void> {
  if (!(await first('SELECT 1 FROM companies_calls WHERE id = ? AND engagement_id = ?', callId, engagementId))) refuse(NO_CALL.code, NO_CALL.reason, { status: 404, remedy: NO_CALL.remedy })
}

export async function addCall(step: Step, input: z.infer<typeof callInput>): Promise<{ callId: string, warnings: string[] }> {
  refuseClosed(step.engagement)
  await checkDay(input)
  const id = newId('cpca')
  const at = nowMs()
  const guard = overlapGuard(input.spaceId, null)
  step.unit.add({
    sql: `INSERT INTO companies_calls (id, engagement_id, kind, space_id, starts_at, ends_at, label, notes, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`,
    params: [id, step.engagement.id, input.kind, input.spaceId ?? null, input.startsAt, input.endsAt, input.label ?? null, input.notes ?? null, at, at, ...guard.params(step.engagement.id, input.startsAt, input.endsAt)],
  }).expect(1, OVERLAP)
  history(step, 'call-changed', { callId: id, change: 'added' })
  await tellContacts(step, id)
  return { callId: id, warnings: await warnings(input) }
}

export async function changeCall(step: Step, callId: string, input: z.infer<typeof callInput>): Promise<{ warnings: string[] }> {
  refuseClosed(step.engagement)
  await requireCall(callId, step.engagement.id)
  await checkDay(input)
  const guard = overlapGuard(input.spaceId, callId)
  step.unit.add({
    sql: `UPDATE companies_calls SET kind = ?, space_id = ?, starts_at = ?, ends_at = ?, label = ?, notes = ?, updated_at = ? WHERE id = ? AND engagement_id = ? AND ${guard.sql}`,
    params: [input.kind, input.spaceId ?? null, input.startsAt, input.endsAt, input.label ?? null, input.notes ?? null, nowMs(), callId, step.engagement.id, ...guard.params(step.engagement.id, input.startsAt, input.endsAt)],
  }).expect(1, OVERLAP)
  history(step, 'call-changed', { callId, change: 'changed' })
  await tellContacts(step, callId)
  return { warnings: await warnings(input) }
}

export async function removeCall(step: Step, callId: string): Promise<void> {
  refuseClosed(step.engagement)
  step.unit.add({ sql: 'DELETE FROM companies_calls WHERE id = ? AND engagement_id = ?', params: [callId, step.engagement.id] })
    .expect(1, NO_CALL)
  history(step, 'call-changed', { callId, change: 'removed' })
  await tellContacts(step, callId)
}

/** The engagement's calls in time order with their space's name, and its people, for staff and the company's contacts. */
export async function schedule(engagementId: string): Promise<{ calls: CallRow[], people: PersonRow[] }> {
  const [calls, people] = await Promise.all([
    all<CallRow>(`SELECT c.id, c.kind, c.space_id AS spaceId, s.name AS space, c.starts_at AS startsAt, c.ends_at AS endsAt, c.label, c.notes
      FROM companies_calls c LEFT JOIN core_spaces s ON s.id = c.space_id WHERE c.engagement_id = ? ORDER BY c.starts_at, c.id`, engagementId),
    all<Omit<PersonRow, 'under18'> & { under18: number | null }>('SELECT id, name, role, under_18 AS under18 FROM companies_people WHERE engagement_id = ? ORDER BY name COLLATE NOCASE', engagementId),
  ])
  return { calls, people: people.map(p => ({ ...p, under18: !!p.under18 })) }
}

/** The spaces a call may be in, named with their venue, for the call form. */
export async function spaceChoices(): Promise<{ value: string, label: string }[]> {
  return (await listVenues()).flatMap(v => v.spaces.map(s => ({ value: s.id, label: `${s.name}, ${v.name}` })))
}
