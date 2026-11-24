// Engagements (spec part 3, rules E1, E3, E5, E6): opening one, and every move as one guarded update
// written in the batch with its history row and its event, so of two people acting at once one wins (CO-02).
import { z } from 'zod'
import { first, newId, nowMs, refuse, useSetting } from '#kit'
import type { Actor, UnitOfWork } from '#kit'
import { setProductionCompanyName } from '#modules/core'
import { ENGAGEMENT_KINDS, LIMITS, MOVES } from '../shared/companies'
import type { EngagementKind, EngagementState, Move } from '../shared/companies'
import type { Company } from './companies'

export interface Engagement {
  id: string
  companyId: string
  companyName: string
  companyPublicName: string
  kind: EngagementKind
  productionId: string | null
  seasonId: string | null
  title: string
  state: EngagementState
}

export const engagementInput = z.object({
  kind: z.enum(ENGAGEMENT_KINDS),
  title: z.string().trim().min(1).max(LIMITS.title).optional(),
  productionId: z.string().min(1).optional(),
  seasonId: z.string().min(1).optional(),
})

export const linkInput = z.object({ productionId: z.string().min(1) })

export const moveInput = z.object({ reason: z.string().trim().min(1).max(LIMITS.reason).optional() })
export type MoveRequest = z.infer<typeof moveInput> & { move: Move }

const COLUMNS = `e.id, e.company_id AS companyId, c.name AS companyName, coalesce(c.public_name, c.name) AS companyPublicName, e.kind, e.production_id AS productionId,
  e.season_id AS seasonId, e.title, e.state`

export async function requireEngagement(id: string): Promise<Engagement> {
  const engagement = await first<Engagement>(`SELECT ${COLUMNS} FROM companies_engagements e JOIN companies_companies c ON c.id = e.company_id WHERE e.id = ?`, id)
  if (!engagement) refuse('core.not-found', 'There is no such engagement.', { status: 404 })
  return engagement
}

/** One history row for the engagement, in the same batch as the change it records. */
function history(unit: UnitOfWork, actor: Actor, row: { engagementId: string, kind: string, from: string | null, to: string | null, at: number }) {
  unit.add({
    sql: 'INSERT INTO companies_engagement_events (id, engagement_id, kind, from_state, to_state, actor_id, at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    params: [newId('cpev'), row.engagementId, row.kind, row.from, row.to, actor.accountId ?? null, row.at, row.at],
  })
}

/** Rule E6: a production has at most one engagement that is not cancelled; a second refuses naming the first. */
async function productionTitle(productionId: string): Promise<string> {
  const production = await first<{ title: string }>('SELECT title FROM core_productions WHERE id = ?', productionId)
  if (!production) refuse('core.not-found', 'There is no such production.', { status: 404 })
  const holder = await first<{ name: string }>(`SELECT c.name FROM companies_engagements e JOIN companies_companies c ON c.id = e.company_id
    WHERE e.production_id = ? AND e.state <> 'cancelled'`, productionId)
  if (holder) refuse('companies.engagement.production-taken', `${production.title} already has an engagement with ${holder.name}.`, { status: 409, remedy: 'Open that engagement, or cancel it first.' })
  return production.title
}

/** Rule E1: a new engagement starts in enquiry, with a company and a kind. */
export async function openEngagement(unit: UnitOfWork, actor: Actor, company: Company, input: z.infer<typeof engagementInput>): Promise<string> {
  if (company.archivedAt !== null) refuse('companies.company.archived', 'This company is archived.', { status: 409, remedy: 'Restore it first.' })
  const productionTitleText = input.productionId ? await productionTitle(input.productionId) : null
  const title = input.title ?? productionTitleText
  if (!title) refuse('companies.engagement.title-needed', 'Give the engagement a title, or link a production.', { status: 422, fields: { title: 'Give it a title.' } })
  const id = newId('cpe')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO companies_engagements (id, company_id, kind, production_id, season_id, title, state, currency, created_by, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, 'enquiry', ?, ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM companies_engagements WHERE production_id = ? AND state <> 'cancelled')`,
    params: [id, company.id, input.kind, input.productionId ?? null, input.seasonId ?? null, title, await useSetting('core.locale.currency') as string, actor.accountId ?? null, at, at, input.productionId ?? null],
  }).expect(1, { code: 'companies.engagement.production-taken', reason: 'Someone opened an engagement for this production just now.', remedy: 'Reload the page to open it.' })
  history(unit, actor, { engagementId: id, kind: 'opened', from: null, to: 'enquiry', at })
  if (input.productionId) await setProductionCompanyName(unit, input.productionId, company.publicName ?? company.name)
  unit.audit({ action: 'create', record: ['companies.engagement', id], detail: { companyId: company.id, kind: input.kind } })
  unit.announce('companies.engagement.changed', { engagementId: id, from: null, to: 'enquiry' }, { record: ['companies.engagement', id] })
  return id
}

/** CO-12, rules E6 and G3: links a production to an engagement that has none; the production then carries the company's public name. */
export async function linkProduction(unit: UnitOfWork, actor: Actor, engagement: Engagement, productionId: string): Promise<void> {
  if (engagement.productionId) refuse('companies.engagement.linked', 'This engagement already has a production.', { status: 409, remedy: 'Open a new engagement for another production.' })
  if (['cancelled', 'settled'].includes(engagement.state)) refuse('companies.engagement.wrong-state', `This engagement is ${engagement.state}.`, { status: 409, remedy: 'Open a new engagement instead.' })
  const title = await productionTitle(productionId)
  const at = nowMs()
  unit.add({
    sql: `UPDATE companies_engagements SET production_id = ?, updated_at = ? WHERE id = ? AND production_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM companies_engagements o WHERE o.production_id = ? AND o.state <> 'cancelled')`,
    params: [productionId, at, engagement.id, productionId],
  }).expect(1, { code: 'companies.engagement.production-taken', reason: `Someone linked ${title} just now.`, remedy: 'Reload the page.' })
  history(unit, actor, { engagementId: engagement.id, kind: 'linked', from: engagement.state, to: engagement.state, at })
  unit.audit({ action: 'update', record: ['companies.engagement', engagement.id], detail: { productionId } })
  await setProductionCompanyName(unit, productionId, engagement.companyPublicName)
}

/** Rule E5: cancelling releases the guest places and withdraws an agreement waiting for an answer; the production is left alone. */
function cancelEffects(unit: UnitOfWork, engagementId: string, at: number): void {
  unit.add({ sql: 'UPDATE companies_allocations SET state = \'released\', updated_at = ? WHERE engagement_id = ? AND state = \'open\'', params: [at, engagementId] })
  unit.add({ sql: 'UPDATE companies_agreements SET state = \'withdrawn\' WHERE engagement_id = ? AND state = \'sent\'', params: [engagementId] })
}

/** Rule E3: what confirming needs beyond the agreed state, as conditions on the guarded update. */
async function confirmConditions(engagement: Engagement): Promise<string> {
  if (engagement.kind !== 'hire' && !engagement.productionId)
    refuse('companies.engagement.needs-production', 'Link a production before confirming.', { status: 422, remedy: 'Open the engagement and link its production.' })
  const conditions: string[] = []
  if (engagement.kind === 'hire') conditions.push('EXISTS (SELECT 1 FROM companies_calls WHERE engagement_id = e.id)')
  if (engagement.kind !== 'act' && await useSetting('companies.agreements.required'))
    conditions.push('EXISTS (SELECT 1 FROM companies_agreements a WHERE a.engagement_id = e.id AND a.state = \'accepted\')')
  return conditions.map(c => ` AND ${c}`).join('')
}

/**
 * A move a person makes (part 3, the moves table). The update's predicate is the state that was read,
 * so a second move from the same state changes nothing and the batch, history and event with it, is refused.
 */
export async function moveEngagement(unit: UnitOfWork, actor: Actor, engagement: Engagement, input: MoveRequest): Promise<void> {
  const { move } = input
  const { from, to } = MOVES[move]
  if (!(from as readonly string[]).includes(engagement.state))
    refuse('companies.engagement.wrong-state', `This engagement is ${engagement.state}, so it cannot be moved to ${to}.`, { status: 409, remedy: 'Reload the page to see where it is now.' })
  if (move === 'cancel' && !input.reason) refuse('companies.engagement.reason-needed', 'Say why it is cancelled.', { status: 422, fields: { reason: 'Say why.' } })
  const extra = move === 'confirm' ? await confirmConditions(engagement) : ''
  const at = nowMs()
  unit.add({
    sql: `UPDATE companies_engagements AS e SET state = ?, cancel_reason = ?, updated_at = ? WHERE e.id = ? AND e.state = ?${extra}`,
    params: [to, move === 'cancel' ? input.reason! : null, at, engagement.id, engagement.state],
  }).expect(1, move === 'confirm' && extra
    ? { code: 'companies.engagement.not-ready', reason: 'This engagement cannot be confirmed yet, or someone changed it just now.', remedy: 'Check its agreement and calls, then reload and try again.' }
    : { code: 'companies.engagement.changed-elsewhere', reason: 'Someone changed this engagement just now.', remedy: 'Reload the page to see where it is now.' })
  if (move === 'cancel') cancelEffects(unit, engagement.id, at)
  history(unit, actor, { engagementId: engagement.id, kind: move === 'cancel' ? 'cancelled' : 'moved', from: engagement.state, to, at })
  unit.audit({ action: 'state', record: ['companies.engagement', engagement.id], detail: { from: engagement.state, to } })
  unit.announce('companies.engagement.changed', { engagementId: engagement.id, from: engagement.state, to }, { record: ['companies.engagement', engagement.id] })
}
