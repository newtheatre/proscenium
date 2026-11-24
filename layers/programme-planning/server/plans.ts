// Plans and entries (spec part 3, rules E1, E2 and W9): starting a season's plan, reading it, and
// putting entries in the tray by hand or by bringing a draft production of the season onto it.
import { z } from 'zod'
import { all, can, first, newId, nowMs, refuse, requireAbility, useSetting } from '#kit'
import type { Actor, UnitOfWork } from '#kit'
import { ENTRY_KINDS, ENTRY_LIMITS, ENTRY_SHAPES } from '../shared/plans'
import type { EntryKind, EntryState, PlanState } from '../shared/plans'

export interface Season { id: string, slug: string, name: string, startsOn: string, endsOn: string, state: string }
export interface Plan { id: string, seasonId: string, state: PlanState, boardFrom: string, boardTo: string, dayStarts: string, dayEnds: string, publishProductions: boolean, publishedAt: number | null, version: number }
export interface Entry {
  id: string
  title: string
  kind: EntryKind
  state: EntryState
  source: string
  productionId: string | null
  categoryTermId: string | null
  minutes: number | null
  getInMinutes: number
  getOutMinutes: number
  performancesWanted: number
  placed: number
  inTray: boolean
}

const SEASON_COLUMNS = 'id, slug, name, starts_on AS startsOn, ends_on AS endsOn, state'
const PLAN_COLUMNS = `id, season_id AS seasonId, state, board_from AS boardFrom, board_to AS boardTo, day_starts AS dayStarts,
  day_ends AS dayEnds, publish_productions AS publishProductions, published_at AS publishedAt, version`

/** A season by its id or its web address, or a 404. */
export async function seasonByKey(key: string | undefined): Promise<Season> {
  const season = key ? await first<Season>(`SELECT ${SEASON_COLUMNS} FROM core_seasons WHERE id = ?1 OR slug = ?1`, key) : null
  if (!season) refuse('core.not-found', 'There is no such season.', { status: 404 })
  return season!
}

/** The season, once the actor is found to hold the ability on it. */
export async function seasonFor(actor: Actor, key: string | undefined, ability: 'programme-planning.plan.view' | 'programme-planning.plan.manage'): Promise<Season> {
  const season = await seasonByKey(key)
  await requireAbility(actor, ability, ['core.season', season.id])
  return season
}

export async function planOfSeason(seasonId: string): Promise<Plan | null> {
  const plan = await first<Plan>(`SELECT ${PLAN_COLUMNS} FROM programme_planning_plans WHERE season_id = ?`, seasonId)
  return plan && { ...plan, publishProductions: !!plan.publishProductions }
}

export async function requirePlan(id: string): Promise<Plan> {
  const plan = await first<Plan>(`SELECT ${PLAN_COLUMNS} FROM programme_planning_plans WHERE id = ?`, id)
  if (!plan) refuse('core.not-found', 'There is no such plan.', { status: 404 })
  return { ...plan!, publishProductions: !!plan!.publishProductions }
}

/** Rule E1 and PP-01: one plan per season, with the season's dates and the settings' day hours. */
export async function startPlan(unit: UnitOfWork, season: Season): Promise<{ planId: string, started: boolean }> {
  const existing = await planOfSeason(season.id)
  if (existing) return { planId: existing.id, started: false }
  const id = newId('pppl')
  const at = nowMs()
  const [dayStarts, dayEnds, publishProductions] = await Promise.all([
    useSetting('programme-planning.board.day-starts'),
    useSetting('programme-planning.board.day-ends'),
    useSetting('programme-planning.publish.productions'),
  ])
  unit.add({
    sql: `INSERT INTO programme_planning_plans (id, season_id, state, board_from, board_to, day_starts, day_ends, publish_productions, version, created_at, updated_at)
          SELECT ?, ?, 'planning', ?, ?, ?, ?, ?, 0, ?, ? WHERE NOT EXISTS (SELECT 1 FROM programme_planning_plans WHERE season_id = ?)`,
    params: [id, season.id, season.startsOn, season.endsOn, dayStarts, dayEnds, publishProductions ? 1 : 0, at, at, season.id],
  }).expect(1, { code: 'programme-planning.plan.started-elsewhere', reason: 'Someone else started this plan just now.', remedy: 'Reload the page to open it.' })
  unit.audit({ action: 'create', record: ['programme-planning.plan', id], detail: { seasonId: season.id } })
  unit.announce('programme-planning.plan.started', { planId: id, seasonId: season.id }, { record: ['programme-planning.plan', id] })
  return { planId: id, started: true }
}

const PLACED = `(SELECT count(*) FROM programme_planning_placements pl JOIN core_performances cp ON cp.id = pl.performance_id
  WHERE pl.entry_id = e.id AND cp.state <> 'cancelled')`

/** Rule W9: an accepted or candidate entry with fewer placements than it wants stays in the tray, accepted first. */
export async function entriesOf(planId: string): Promise<Entry[]> {
  const rows = await all<Omit<Entry, 'inTray'>>(`SELECT e.id, coalesce(p.title, e.title) AS title, e.kind, e.state, e.source, e.production_id AS productionId,
      coalesce(p.category_term_id, e.category_term_id) AS categoryTermId, coalesce(p.running_minutes, e.minutes) AS minutes,
      e.get_in_minutes AS getInMinutes, e.get_out_minutes AS getOutMinutes, e.performances_wanted AS performancesWanted, ${PLACED} AS placed
    FROM programme_planning_entries e LEFT JOIN core_productions p ON p.id = e.production_id
    WHERE e.plan_id = ?
    ORDER BY CASE e.state WHEN 'accepted' THEN 0 WHEN 'candidate' THEN 1 WHEN 'declined' THEN 2 ELSE 3 END, e.id`, planId) // not-policy: an order of states
  return rows.map(r => ({ ...r, inTray: (r.state === 'accepted' || r.state === 'candidate') && r.placed < r.performancesWanted }))
}

export interface Overview {
  counts: Record<EntryState, number>
  placed: number
  wanted: number
}

export async function overviewOf(planId: string): Promise<Overview> {
  const entries = await entriesOf(planId)
  const counts: Record<EntryState, number> = { candidate: 0, accepted: 0, declined: 0, withdrawn: 0 }
  for (const e of entries) counts[e.state]++
  const live = entries.filter(e => e.state === 'accepted')
  return { counts, placed: live.reduce((n, e) => n + e.placed, 0), wanted: live.reduce((n, e) => n + e.performancesWanted, 0) }
}

/** What the actor may do with a season's plan, for the screen's buttons. */
export async function mayOn(actor: Actor, seasonId: string, planId: string | null) {
  const allowed = async (ability: Parameters<typeof can>[1], record: readonly [string, string]) => (await can(actor, ability, record)).allowed
  const season = ['core.season', seasonId] as const
  const plan = planId ? ['programme-planning.plan', planId] as const : season
  return {
    manage: await allowed('programme-planning.plan.manage', season),
    viewEntries: await allowed('programme-planning.entry.view', plan),
    manageEntries: await allowed('programme-planning.entry.manage', plan),
  }
}

/** Every board write raises the version, so other open boards reload. A closed plan takes none. */
function touch(unit: UnitOfWork, plan: Plan, at: number): void {
  unit.add({ sql: 'UPDATE programme_planning_plans SET version = version + 1, updated_at = ? WHERE id = ? AND state <> \'closed\'', params: [at, plan.id] })
    .expect(1, { code: 'programme-planning.plan.closed', reason: 'This plan is closed.', remedy: 'Reopen the plan to change it.' })
}

export const entryInput = z.object({
  title: z.string().trim().min(1).max(ENTRY_LIMITS.title),
  kind: z.enum(ENTRY_KINDS),
  categoryTermId: z.string().nullish(),
  minutes: z.number().int().min(1).max(ENTRY_LIMITS.minutes).nullish(),
  getInMinutes: z.number().int().min(0).max(ENTRY_LIMITS.getInOut).default(0),
  getOutMinutes: z.number().int().min(0).max(ENTRY_LIMITS.getInOut).default(0),
  performancesWanted: z.number().int().min(1).max(ENTRY_LIMITS.wanted).default(1),
  shape: z.enum(ENTRY_SHAPES).default('timed'),
  staffNote: z.string().trim().max(ENTRY_LIMITS.note).nullish(),
})

/** PP-02, typed in: a candidate, decided later (E3). */
export async function addEntry(unit: UnitOfWork, plan: Plan, input: z.infer<typeof entryInput>): Promise<string> {
  if (input.categoryTermId && !(await first('SELECT 1 FROM core_terms WHERE id = ? AND vocabulary_key = \'core.production-category\'', input.categoryTermId)))
    refuse('programme-planning.entry.no-category', 'There is no such category.', { status: 422, fields: { categoryTermId: 'programme-planning.entry.no-category' } })
  const id = newId('ppen')
  const at = nowMs()
  touch(unit, plan, at)
  unit.add({
    sql: `INSERT INTO programme_planning_entries (id, plan_id, source, title, kind, category_term_id, state, minutes, get_in_minutes, get_out_minutes,
            performances_wanted, shape, staff_note, created_at, updated_at)
          VALUES (?, ?, 'manual', ?, ?, ?, 'candidate', ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [id, plan.id, input.title, input.kind, input.categoryTermId ?? null, input.minutes ?? null, input.getInMinutes, input.getOutMinutes,
      input.performancesWanted, input.shape, input.staffNote || null, at, at],
  })
  unit.audit({ action: 'create', record: ['programme-planning.entry', id], detail: { source: 'manual' } })
  unit.announce('programme-planning.entry.added', { entryId: id, planId: plan.id }, { record: ['programme-planning.entry', id] })
  return id
}

export interface Bringable { id: string, title: string, kind: EntryKind, runningMinutes: number | null }

/** Draft productions of the plan's season that are not on its board yet. */
export function bringable(plan: Plan): Promise<Bringable[]> {
  return all<Bringable>(`SELECT p.id, p.title, p.kind, p.running_minutes AS runningMinutes FROM core_productions p
    WHERE p.season_id = ? AND p.state = 'draft' AND NOT EXISTS (SELECT 1 FROM programme_planning_entries e WHERE e.production_id = p.id)
    ORDER BY lower(p.title)`, plan.seasonId)
}

export const bringInput = z.object({
  productionId: z.string(),
  performancesWanted: z.number().int().min(1).max(ENTRY_LIMITS.wanted).default(1),
})

/** Rule E2: an existing draft production of the season comes onto the board already accepted. */
export async function bringProduction(unit: UnitOfWork, plan: Plan, input: z.infer<typeof bringInput>): Promise<string> {
  const production = await first<{ season_id: string | null, state: string, title: string }>('SELECT season_id, state, title FROM core_productions WHERE id = ?', input.productionId)
  if (!production) refuse('core.not-found', 'There is no such production.', { status: 404 })
  if (production!.season_id !== plan.seasonId)
    refuse('programme-planning.entry.other-season', `${production!.title} is not in this season.`, { status: 422, remedy: 'Move it into this season first, or plan it in its own.' })
  if (production!.state !== 'draft')
    refuse('programme-planning.entry.not-draft', `${production!.title} is no longer a draft.`, { status: 409, remedy: 'Only draft productions can be brought onto the board.' })
  const id = newId('ppen')
  const at = nowMs()
  touch(unit, plan, at)
  unit.add({
    sql: `INSERT INTO programme_planning_entries (id, plan_id, source, title, kind, category_term_id, state, production_id, minutes,
            performances_wanted, decided_at, created_at, updated_at)
          SELECT ?, ?, 'manual', p.title, p.kind, p.category_term_id, 'accepted', p.id, p.running_minutes, ?, ?, ?, ?
          FROM core_productions p WHERE p.id = ? AND p.state = 'draft'
            AND NOT EXISTS (SELECT 1 FROM programme_planning_entries e WHERE e.production_id = p.id)`,
    params: [id, plan.id, input.performancesWanted, at, at, at, input.productionId],
  }).expect(1, { code: 'programme-planning.entry.already-on-board', reason: `${production!.title} is already on the board.` })
  unit.audit({ action: 'create', record: ['programme-planning.entry', id], detail: { source: 'production', productionId: input.productionId } })
  unit.announce('programme-planning.entry.added', { entryId: id, planId: plan.id }, { record: ['programme-planning.entry', id] })
  return id
}
