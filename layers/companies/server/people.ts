// Company people (spec part 3, rule D3): who from the company will be in the building. Its contacts keep
// the list until the first call or performance starts; staff keep it after.
import { z } from 'zod'
import { can, first, newId, nowMs, refuse } from '#kit'
import type { Actor } from '#kit'
import { LIMITS } from '../shared/companies'
import { history, refuseClosed } from './calls'
import type { Step } from './calls'
import type { Engagement } from './engagements'

const NO_PERSON = { code: 'core.not-found', reason: 'There is no such person.', remedy: 'Reload the page.' }

export const personInput = z.object({
  name: z.string().trim().min(1).max(LIMITS.personName),
  role: z.string().trim().max(LIMITS.role).transform(v => v || null).nullable().optional(),
  under18: z.boolean().default(false),
})

/** Whether the engagement's first call or performance has started. */
export async function started(engagement: Engagement): Promise<boolean> {
  const row = await first<{ at: number | null }>(`SELECT min(at) AS at FROM (
      SELECT min(starts_at) AS at FROM companies_calls WHERE engagement_id = ?
      UNION ALL SELECT min(starts_at) FROM core_performances WHERE production_id = ? AND state <> 'cancelled')`, engagement.id, engagement.productionId)
  return row?.at != null && row.at <= nowMs()
}

/** Rule D3: staff always; a contact holding `people.manage-own` only until the first date has started. */
export async function peopleAccess(actor: Actor, engagement: Engagement): Promise<{ canManage: boolean, staff: boolean }> {
  const record = ['companies.engagement', engagement.id] as const
  const [staff, own] = await Promise.all([
    can(actor, 'companies.engagement.manage', record).then(d => d.allowed),
    can(actor, 'companies.people.manage-own', record).then(d => d.allowed),
  ])
  return { staff, canManage: staff || (own && !(await started(engagement))) }
}

export async function requirePeopleAccess(actor: Actor, engagement: Engagement): Promise<void> {
  const access = await peopleAccess(actor, engagement)
  if (access.canManage) return
  const own = (await can(actor, 'companies.people.manage-own', ['companies.engagement', engagement.id])).allowed
  if (own) refuse('companies.people.started', 'The first date has started, so the theatre keeps this list now.', { status: 409, remedy: 'Ask the theatre to make the change.' })
  refuse('core.access.denied', 'You cannot change this engagement\'s people.', { status: 403 })
}

export function addPerson(step: Step, input: z.infer<typeof personInput>): string {
  refuseClosed(step.engagement)
  const id = newId('cpp')
  const at = nowMs()
  step.unit.add({
    sql: 'INSERT INTO companies_people (id, engagement_id, name, role, under_18, added_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    params: [id, step.engagement.id, input.name, input.role ?? null, input.under18 ? 1 : 0, step.actor.accountId ?? null, at, at],
  })
  history(step, 'people-changed', { personId: id, change: 'added' })
  return id
}

export function changePerson(step: Step, personId: string, input: z.infer<typeof personInput>): void {
  refuseClosed(step.engagement)
  step.unit.add({
    sql: 'UPDATE companies_people SET name = ?, role = ?, under_18 = ?, updated_at = ? WHERE id = ? AND engagement_id = ?',
    params: [input.name, input.role ?? null, input.under18 ? 1 : 0, nowMs(), personId, step.engagement.id],
  }).expect(1, NO_PERSON)
  history(step, 'people-changed', { personId, change: 'changed' })
}

export function removePerson(step: Step, personId: string): void {
  refuseClosed(step.engagement)
  step.unit.add({ sql: 'DELETE FROM companies_people WHERE id = ? AND engagement_id = ?', params: [personId, step.engagement.id] })
    .expect(1, NO_PERSON)
  history(step, 'people-changed', { personId, change: 'removed' })
}
