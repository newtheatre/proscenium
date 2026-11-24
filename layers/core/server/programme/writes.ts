// Core's write services for other modules (C-68; festival-ready changes, part 4): productions,
// performances and credits made and changed inside the caller's own unit of work, which they never
// commit. They check no ability: the caller's route checks its own on the record. Core's own routes
// call the same functions underneath, so there is one path.
import { first, refuse, siteOrigin, useContext } from '#kit'
import type { UnitView } from '#kit'
import { createProduction as createProductionAs, updateProduction, type ProductionInput } from './service'
import { createPerformance as createPerformanceAs, movePerformance as movePerformanceAs, type MadeProduction, type PerformanceInput } from './performances'
import { insertCredit, removeCredit as removeCreditOf, updateCredit as updateCreditOf, type CreditInput } from './credits'

export { schedulePerformances } from './performances'
export type { ScheduleRefusal } from './performances'

export interface NewProduction extends Pick<ProductionInput, 'title' | 'kind' | 'seasonId' | 'summary' | 'categoryTermId' | 'companyName' | 'runningMinutes'> {
  /** Production-wide credits, made with it. */
  credits?: CreditInput[]
}

// The linked person is told with a link to their credits, so the origin is needed only then.
const actorId = () => useContext().actor.accountId ?? null

/** A new production, always a draft, with any credits given. Returns its id. */
export async function createProduction(unit: UnitView, input: NewProduction): Promise<string> {
  const { credits = [], ...production } = input
  const id = await createProductionAs(unit, production, actorId())
  const origin = credits.some(c => c.accountId) ? await siteOrigin() : ''
  for (const credit of credits) await insertCredit(unit, id, { title: input.title, state: 'draft' }, credit, origin)
  return id
}

export interface NewPerformance extends Omit<PerformanceInput, 'venueId'> {
  productionId: string
  /** Its production's defaults when that production was made earlier in the same unit. */
  made?: MadeProduction
}

/** A new performance, always a draft, in an active space that can hold performances (checked on the statement). */
export async function createPerformance(unit: UnitView, input: NewPerformance): Promise<string> {
  const { productionId, made, ...rest } = input
  const space = await first<{ venue_id: string }>('SELECT venue_id FROM core_spaces WHERE id = ?', rest.spaceId)
  if (!space) refuse('core.performance.space-unsuitable', 'Choose a space that is in use and can hold performances.', { status: 422, fields: { spaceId: 'Choose a space.' } })
  return createPerformanceAs(unit, productionId, { ...rest, venueId: space.venue_id }, actorId(), made)
}

/** A new space and time: a draft moves freely; a scheduled one passes the guards and is announced as a move by hand is. */
export async function movePerformance(unit: UnitView, id: string, to: { spaceId: string, startsAt: number, endsAt: number }): Promise<{ warnings: string[] }> {
  return movePerformanceAs(unit, id, to, useContext().actor)
}

/** Keeps a production's company name in step with the company linked to it (Companies). */
export async function setProductionCompanyName(unit: UnitView, productionId: string, name: string | null): Promise<void> {
  await updateProduction(unit, productionId, { companyName: name })
}

export interface NewCredit extends CreditInput { productionId: string }

/** A credit: production-wide, for one performance, or for one line-up item (LU4). The linked person is told, as when staff add one. */
export async function addCredit(unit: UnitView, input: NewCredit): Promise<string> {
  const { productionId, ...credit } = input
  const production = await first<{ title: string, state: string }>('SELECT title, state FROM core_productions WHERE id = ?', productionId)
  if (!production) refuse('core.not-found', 'There is no such production.', { status: 404 })
  return insertCredit(unit, productionId, production, credit, credit.accountId ? await siteOrigin() : '')
}

async function productionOfCredit(creditId: string): Promise<string> {
  const row = await first<{ production_id: string }>('SELECT production_id FROM core_production_credits WHERE id = ?', creditId)
  if (!row) refuse('core.not-found', 'There is no such credit.', { status: 404 })
  return row.production_id
}

/** Changes a credit. Visibility is left out: a linked person's own choice is never overwritten by a caller. */
export async function updateCredit(unit: UnitView, creditId: string, patch: Partial<Omit<CreditInput, 'visibility'>>): Promise<void> {
  const { visibility: _ignored, ...allowed } = patch as Partial<CreditInput>
  await updateCreditOf(unit, await productionOfCredit(creditId), creditId, allowed, allowed.accountId ? await siteOrigin() : '')
}

export async function removeCredit(unit: UnitView, creditId: string): Promise<void> {
  await removeCreditOf(unit, await productionOfCredit(creditId), creditId)
}
