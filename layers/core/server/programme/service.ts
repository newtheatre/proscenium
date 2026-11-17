// Seasons and productions (part 2, group 1; part 3; C-01, C-02, C-03, C-09, C-10). Moves are
// guarded in the statement that makes them, so two people pressing at once cannot both succeed; a
// read beforehand only chooses the words of the refusal. Performances are in performances.ts;
// credits and cancelling a whole production arrive in later slices.
import { sql } from 'drizzle-orm'
import { all, first, newId, nowMs, refuse, useSetting } from '#kit'
import type { Actor, UnitView } from '#kit'
import { assertTerm } from '../vocabularies/service'
import { changeImpact, firstRefusal, syncProductionDates } from './performances'

// ---------------------------------------------------------------------------------------------
// Slugs

export function slugFrom(text: string, fallback: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback // not-policy: a slug's pattern and length
}

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/ // not-policy: a slug's pattern

async function freeSlug(base: string, taken: (candidate: string) => Promise<boolean>): Promise<string> {
  let slug = base
  for (let n = 2; await taken(slug); n++) slug = `${base}-${n}`
  return slug
}

/** True if a production has, or ever had, this slug. Past slugs are never given to another. */
async function productionSlugTaken(slug: string, except?: string): Promise<boolean> {
  return !!await first(`SELECT 1 FROM core_productions WHERE slug = ? AND id IS NOT ?
    UNION ALL SELECT 1 FROM core_production_slugs WHERE slug = ? AND production_id IS NOT ?`, slug, except ?? null, slug, except ?? null)
}

// ---------------------------------------------------------------------------------------------
// Seasons

export type SeasonState = 'draft' | 'published' | 'archived'
export interface Season { id: string, slug: string, name: string, startsOn: string, endsOn: string, summary: string | null, state: SeasonState, productions: number }
export interface SeasonInput { name: string, startsOn: string, endsOn: string, summary?: string | null }

interface SeasonRow { id: string, slug: string, name: string, starts_on: string, ends_on: string, summary: string | null, state: SeasonState, productions: number }
const toSeason = (r: SeasonRow): Season => ({ id: r.id, slug: r.slug, name: r.name, startsOn: r.starts_on, endsOn: r.ends_on, summary: r.summary, state: r.state, productions: r.productions ?? 0 })

const SEASON_NAME_TAKEN = { code: 'core.season.name-taken', reason: 'Another season has that name.', remedy: 'Choose a different name.' }

function checkDates(startsOn: string, endsOn: string) {
  if (endsOn < startsOn) refuse('core.season.dates', 'The season must end on or after the day it starts.', { status: 422, fields: { endsOn: 'The season must end on or after the day it starts.' } })
}

async function seasonRow(id: string): Promise<SeasonRow> {
  const row = await first<SeasonRow>('SELECT * FROM core_seasons WHERE id = ?', id)
  if (!row) refuse('core.season.not-found', 'There is no such season.', { status: 404 })
  return row
}

export async function listSeasons(): Promise<Season[]> {
  return (await all<SeasonRow>(`SELECT s.*, (SELECT count(*) FROM core_productions p WHERE p.season_id = s.id) AS productions
    FROM core_seasons s ORDER BY s.starts_on DESC, s.sort, lower(s.name)`)).map(toSeason)
}

export async function createSeason(unit: UnitView, input: SeasonInput): Promise<string> {
  checkDates(input.startsOn, input.endsOn)
  const id = newId('sea')
  const base = slugFrom(input.name, 'season')
  const slug = await freeSlug(base, async s => !!await first('SELECT 1 FROM core_seasons WHERE slug = ?', s))
  unit.add(sql`INSERT INTO core_seasons (id, slug, name, starts_on, ends_on, summary, state, sort, created_at)
    SELECT ${id}, ${slug}, ${input.name}, ${input.startsOn}, ${input.endsOn}, ${input.summary ?? null}, 'draft', 0, ${nowMs()}
    WHERE NOT EXISTS (SELECT 1 FROM core_seasons WHERE lower(name) = lower(${input.name}))`).expect(1, SEASON_NAME_TAKEN)
  unit.audit({ action: 'create', record: ['core.season', id] })
  return id
}

export async function updateSeason(unit: UnitView, id: string, input: Partial<SeasonInput>): Promise<void> {
  const row = await seasonRow(id)
  const v = { name: input.name ?? row.name, startsOn: input.startsOn ?? row.starts_on, endsOn: input.endsOn ?? row.ends_on, summary: input.summary === undefined ? row.summary : input.summary }
  checkDates(v.startsOn, v.endsOn)
  unit.add(sql`UPDATE core_seasons SET name = ${v.name}, starts_on = ${v.startsOn}, ends_on = ${v.endsOn}, summary = ${v.summary}
    WHERE id = ${id} AND NOT EXISTS (SELECT 1 FROM core_seasons WHERE lower(name) = lower(${v.name}) AND id != ${id})`).expect(1, SEASON_NAME_TAKEN)
  unit.audit({ action: 'update', record: ['core.season', id] })
}

const SEASON_MOVES: Record<SeasonState, SeasonState[]> = { draft: ['published'], published: ['draft', 'archived'], archived: ['published'] }

/** Moves a season (part 3). Back to draft only while none of its productions is published. */
export async function moveSeason(unit: UnitView, id: string, to: SeasonState): Promise<void> {
  const row = await seasonRow(id)
  if (row.state === to) return
  if (!SEASON_MOVES[row.state].includes(to)) refuse('core.season.move', `A ${row.state} season cannot become ${to}.`, { status: 409 })
  const guard = to === 'draft' ? sql`AND NOT EXISTS (SELECT 1 FROM core_productions WHERE season_id = ${id} AND state = 'published')` : sql``
  unit.add(sql`UPDATE core_seasons SET state = ${to} WHERE id = ${id} AND state = ${row.state} ${guard}`)
    .expect(1, to === 'draft'
      ? { code: 'core.season.has-published', reason: 'A published production belongs to this season.', remedy: 'Withdraw its productions or move them to another season first.' }
      : { code: 'core.season.changed', reason: 'Someone else changed this season just now.', remedy: 'Refresh and try again.' })
  unit.audit({ action: 'state', record: ['core.season', id], detail: { from: row.state, to } })
  if (to === 'published') unit.announce('core.season.published', { seasonId: id }, { record: ['core.season', id] })
  if (to === 'archived') unit.announce('core.season.archived', { seasonId: id }, { record: ['core.season', id] })
}

export async function deleteSeason(unit: UnitView, id: string): Promise<void> {
  await seasonRow(id)
  unit.add(sql`DELETE FROM core_seasons WHERE id = ${id} AND state = 'draft' AND NOT EXISTS (SELECT 1 FROM core_productions WHERE season_id = ${id})`)
    .expect(1, { code: 'core.season.in-use', reason: 'Only a draft season with no productions can be deleted.', remedy: 'Move its productions to another season, or archive it instead.' })
  unit.audit({ action: 'delete', record: ['core.season', id] })
}

// ---------------------------------------------------------------------------------------------
// Productions

export type ProductionState = 'draft' | 'published' | 'withdrawn' | 'cancelled'
export type ProductionKind = 'own' | 'visiting' | 'hire' | 'event'

export interface ProductionInput {
  title: string
  kind: ProductionKind
  slug?: string
  subtitle?: string | null
  summary?: string | null
  description?: string | null
  categoryTermId?: string | null
  seasonId?: string | null
  companyName?: string | null
  ageGuidance?: string | null
  advisoriesConfirmedNone?: boolean
  contentNote?: string | null
  runningMinutes?: number | null
  intervalCount?: number
  externalBookingUrl?: string | null
  creditsPublic?: boolean
  listed?: boolean
}

export interface Production {
  id: string
  slug: string
  title: string
  subtitle: string | null
  summary: string | null
  description: string | null
  kind: ProductionKind
  categoryTermId: string | null
  seasonId: string | null
  companyName: string | null
  ageGuidance: string | null
  advisoriesConfirmedNone: boolean
  contentNote: string | null
  runningMinutes: number | null
  intervalCount: number
  externalBookingUrl: string | null
  creditsPublic: boolean
  listed: boolean
  state: ProductionState
  cancelReasonTermId: string | null
  publishedAt: number | null
  firstStartsAt: number | null
  lastEndsAt: number | null
}

export interface Advisory { termId: string, detail: string | null }

interface ProductionRow {
  id: string
  slug: string
  title: string
  subtitle: string | null
  summary: string | null
  description: string | null
  kind: ProductionKind
  category_term_id: string | null
  season_id: string | null
  company_name: string | null
  age_guidance: string | null
  advisories_confirmed_none: number
  content_note: string | null
  running_minutes: number | null
  interval_count: number
  external_booking_url: string | null
  credits_public: number
  listed: number
  state: ProductionState
  cancel_reason_term_id: string | null
  published_at: number | null
  first_starts_at: number | null
  last_ends_at: number | null
}

const toProduction = (r: ProductionRow): Production => ({
  id: r.id, slug: r.slug, title: r.title, subtitle: r.subtitle, summary: r.summary, description: r.description, kind: r.kind,
  categoryTermId: r.category_term_id, seasonId: r.season_id, companyName: r.company_name, ageGuidance: r.age_guidance,
  advisoriesConfirmedNone: !!r.advisories_confirmed_none, contentNote: r.content_note, runningMinutes: r.running_minutes,
  intervalCount: r.interval_count, externalBookingUrl: r.external_booking_url, creditsPublic: !!r.credits_public, listed: !!r.listed,
  state: r.state, cancelReasonTermId: r.cancel_reason_term_id, publishedAt: r.published_at, firstStartsAt: r.first_starts_at, lastEndsAt: r.last_ends_at,
})

// Field name, column, and whether the public sees it (a change to one on a published production is announced).
const FIELDS: [keyof ProductionInput, keyof ProductionRow, boolean][] = [
  ['title', 'title', true], ['subtitle', 'subtitle', true], ['summary', 'summary', true], ['description', 'description', true], ['kind', 'kind', false],
  ['categoryTermId', 'category_term_id', true], ['seasonId', 'season_id', true], ['companyName', 'company_name', true], ['ageGuidance', 'age_guidance', true],
  ['advisoriesConfirmedNone', 'advisories_confirmed_none', true], ['contentNote', 'content_note', true], ['runningMinutes', 'running_minutes', true],
  ['intervalCount', 'interval_count', true], ['externalBookingUrl', 'external_booking_url', true], ['creditsPublic', 'credits_public', true], ['listed', 'listed', true],
]

const CATEGORY_REFUSED = { code: 'core.production.category-unknown', reason: 'Choose a category from the list.' }
const SEASON_REFUSED = { code: 'core.production.season-unknown', reason: 'There is no such season.' }

async function productionRow(id: string): Promise<ProductionRow> {
  const row = await first<ProductionRow>('SELECT * FROM core_productions WHERE id = ?', id)
  if (!row) refuse('core.production.not-found', 'There is no such production.', { status: 404 })
  return row
}

export async function getProduction(id: string): Promise<Production & { advisories: Advisory[] }> {
  const production = toProduction(await productionRow(id))
  const advisories = (await all<{ term_id: string, detail: string | null }>('SELECT term_id, detail FROM core_production_advisories WHERE production_id = ? ORDER BY sort', id))
    .map(a => ({ termId: a.term_id, detail: a.detail }))
  return { ...production, advisories }
}

export interface ProductionQuery { q?: string, state?: ProductionState, seasonId?: string, categoryTermId?: string, page: number, size: number, sort?: 'title' | 'next', order?: 'asc' | 'desc' }

/** The console's list: newest first by default, or by title, or by when the run starts. */
export async function listProductions(query: ProductionQuery): Promise<{ rows: Production[], total: number }> {
  const where: string[] = []
  const params: unknown[] = []
  // To be replaced: search moves behind the kit's readList (Foundations part 4), and no module keeps
  // a LIKE of its own. Add no more.
  if (query.q?.trim()) {
    where.push("(lower(title) LIKE ? ESCAPE '\\' OR lower(coalesce(company_name, '')) LIKE ? ESCAPE '\\')")
    const like = `%${query.q.trim().toLowerCase().replace(/[\\%_]/g, c => `\\${c}`)}%`
    params.push(like, like)
  }
  for (const [column, wanted] of [['state', query.state], ['season_id', query.seasonId], ['category_term_id', query.categoryTermId]] as const) {
    if (!wanted) continue
    where.push(`${column} = ?`)
    params.push(wanted)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const direction = query.order === 'asc' ? 'ASC' : 'DESC'
  const order = query.sort === 'title' ? `lower(title) ${query.order === 'desc' ? 'DESC' : 'ASC'}` : query.sort === 'next' ? `first_starts_at IS NULL, first_starts_at ${direction}` : 'created_at DESC'
  const total = (await first<{ n: number }>(`SELECT count(*) AS n FROM core_productions ${clause}`, ...params))!.n
  const rows = await all<ProductionRow>(`SELECT * FROM core_productions ${clause} ORDER BY ${order}, id LIMIT ? OFFSET ?`, ...params, query.size, (query.page - 1) * query.size)
  return { rows: rows.map(toProduction), total }
}

/** The production a slug names now, or named once: an old slug redirects for ever. */
export async function productionBySlug(slug: string): Promise<{ id: string, slug: string, moved: boolean } | null> {
  const live = await first<{ id: string, slug: string }>('SELECT id, slug FROM core_productions WHERE slug = ?', slug)
  if (live) return { ...live, moved: false }
  const old = await first<{ id: string, slug: string }>('SELECT p.id, p.slug FROM core_production_slugs s JOIN core_productions p ON p.id = s.production_id WHERE s.slug = ?', slug)
  return old ? { ...old, moved: true } : null
}

const value = (v: unknown) => (typeof v === 'boolean' ? (v ? 1 : 0) : v ?? null)

export async function createProduction(unit: UnitView, input: ProductionInput, actorId: string | null): Promise<string> {
  const id = newId('prd')
  const slug = input.slug ?? await freeSlug(slugFrom(input.title, 'production'), s => productionSlugTaken(s))
  if (input.slug && await productionSlugTaken(input.slug)) refuse('core.production.slug-taken', 'A production has, or once had, that web address.', { status: 409, fields: { slug: 'Choose a different web address.' } })
  if (input.seasonId && !await first('SELECT 1 FROM core_seasons WHERE id = ?', input.seasonId)) refuse(SEASON_REFUSED.code, SEASON_REFUSED.reason, { status: 422 })
  const creditsPublic = input.creditsPublic ?? await useSetting('core.programme.credits-public') as boolean
  const at = nowMs()
  unit.add(sql`INSERT INTO core_productions (id, slug, title, subtitle, summary, description, kind, category_term_id, season_id, company_name, age_guidance,
      advisories_confirmed_none, content_note, running_minutes, interval_count, external_booking_url, credits_public, state, listed, created_by, created_at)
    SELECT ${id}, ${slug}, ${input.title}, ${input.subtitle ?? null}, ${input.summary ?? null}, ${input.description ?? null}, ${input.kind}, ${input.categoryTermId ?? null},
      ${input.seasonId ?? null}, ${input.companyName ?? null}, ${input.ageGuidance ?? null}, ${input.advisoriesConfirmedNone ? 1 : 0}, ${input.contentNote ?? null},
      ${input.runningMinutes ?? null}, ${input.intervalCount ?? 0}, ${input.externalBookingUrl ?? null}, ${creditsPublic ? 1 : 0}, 'draft', ${input.listed === false ? 0 : 1}, ${actorId}, ${at}
    WHERE ${input.categoryTermId ? assertTerm(input.categoryTermId, 'core.production-category') : sql`1`}`).expect(1, CATEGORY_REFUSED)
  unit.audit({ action: 'create', record: ['core.production', id] })
  return id
}

/**
 * Changes a production's details. A new slug keeps the old one as a redirect once the production
 * has ever been public. On a published production, a change to a public field is announced with
 * the names of the fields, never their values.
 */
export async function updateProduction(unit: UnitView, id: string, input: Partial<ProductionInput>): Promise<string[]> {
  const row = await productionRow(id)
  if (row.state === 'cancelled') refuse('core.production.cancelled', 'A cancelled production cannot be edited.', { status: 409, remedy: 'Undo the cancellation first.' })
  const changed = FIELDS.filter(([key, column]) => input[key] !== undefined && value(input[key]) !== row[column])
  const slugChanged = input.slug !== undefined && input.slug !== row.slug
  if (!changed.length && !slugChanged) return []
  if (slugChanged && await productionSlugTaken(input.slug!, id)) refuse('core.production.slug-taken', 'A production has, or once had, that web address.', { status: 409, fields: { slug: 'Choose a different web address.' } })
  if (input.seasonId && input.seasonId !== row.season_id && !await first('SELECT 1 FROM core_seasons WHERE id = ?', input.seasonId)) refuse(SEASON_REFUSED.code, SEASON_REFUSED.reason, { status: 422 })

  const sets = changed.map(([key, column]) => sql`${sql.raw(column)} = ${value(input[key])}`)
  if (slugChanged) sets.push(sql`slug = ${input.slug!}`)
  // A published production keeps what publishing needed.
  if (row.state === 'published' && (input.summary === null || input.categoryTermId === null))
    refuse('core.production.needed-to-publish', 'A published production needs a summary and a category.', { status: 422, remedy: 'Withdraw it first to remove them.' })
  if (row.state === 'published' && input.advisoriesConfirmedNone === false && !await first('SELECT 1 FROM core_production_advisories WHERE production_id = ?', id))
    refuse('core.production.advisories-needed', 'A published production lists its advisories or confirms it has none.', { status: 422 })
  const categoryGuard = input.categoryTermId && input.categoryTermId !== row.category_term_id ? assertTerm(input.categoryTermId, 'core.production-category') : sql`1`
  if (slugChanged && row.published_at !== null)
    unit.add(sql`INSERT INTO core_production_slugs (slug, production_id, retired_at) VALUES (${row.slug}, ${id}, ${nowMs()})`)
  unit.add(sql`UPDATE core_productions SET ${sql.join(sets, sql`, `)} WHERE id = ${id} AND state = ${row.state} AND ${categoryGuard}`).expect(1, CATEGORY_REFUSED)
  const fields = [...changed.filter(([, , pub]) => pub).map(([key]) => key as string), ...(slugChanged ? ['slug'] : [])]
  unit.audit({ action: 'update', record: ['core.production', id], detail: { fields } })
  if (row.state === 'published' && fields.length) unit.announce('core.production.updated', { productionId: id, fields }, { record: ['core.production', id] })
  return fields
}

/**
 * Replaces a production's advisories with the list given, in order. Listing any clears "confirmed
 * as none"; an empty list leaves the confirmation as it is, so silence is never taken for none.
 */
export async function setAdvisories(unit: UnitView, id: string, advisories: Advisory[]): Promise<void> {
  const row = await productionRow(id)
  if (new Set(advisories.map(a => a.termId)).size !== advisories.length) refuse('core.production.advisory-repeated', 'Each advisory can be listed once.', { status: 422 })
  // A published production keeps an answer: it cannot be left with neither advisories nor "none".
  if (row.state === 'published' && !advisories.length && !row.advisories_confirmed_none)
    refuse('core.production.advisories-needed', 'A published production lists its advisories or confirms it has none.', { status: 422 })
  unit.add(sql`DELETE FROM core_production_advisories WHERE production_id = ${id}`)
  advisories.forEach((a, sort) => {
    unit.add(sql`INSERT INTO core_production_advisories (production_id, term_id, detail, sort)
      SELECT ${id}, ${a.termId}, ${a.detail}, ${sort} WHERE ${assertTerm(a.termId, 'core.advisory')}`)
      .expect(1, { code: 'core.production.advisory-unknown', reason: 'Choose advisories from the list.' })
  })
  if (advisories.length && row.advisories_confirmed_none) unit.add(sql`UPDATE core_productions SET advisories_confirmed_none = 0 WHERE id = ${id}`)
  unit.audit({ action: 'update', record: ['core.production', id], detail: { advisories: advisories.length } })
  if (row.state === 'published') unit.announce('core.production.updated', { productionId: id, fields: ['advisories'] }, { record: ['core.production', id] })
}

/** What publishing still needs, in the words the person sees. Empty when it can be published. */
export async function publishingNeeds(id: string): Promise<string[]> {
  const row = await productionRow(id)
  const needs: string[] = []
  if (!row.summary) needs.push('a summary')
  if (!row.category_term_id) needs.push('a category')
  if (!row.advisories_confirmed_none && !await first('SELECT 1 FROM core_production_advisories WHERE production_id = ?', id)) needs.push('its advisories, or confirmation that it has none')
  return needs
}

/** Draft or withdrawn to published (part 3). Does not publish its dates. */
export async function publishProduction(unit: UnitView, id: string): Promise<void> {
  const row = await productionRow(id)
  if (row.state === 'published') return
  if (row.state === 'cancelled') refuse('core.production.cancelled', 'A cancelled production cannot be published.', { status: 409, remedy: 'Undo the cancellation first.' })
  const needs = await publishingNeeds(id)
  if (needs.length) refuse('core.production.not-ready', `To publish, the production needs ${needs.join(', ')}.`, { status: 422 })
  unit.add(sql`UPDATE core_productions SET state = 'published', published_at = coalesce(published_at, ${nowMs()})
    WHERE id = ${id} AND state = ${row.state} AND summary IS NOT NULL AND category_term_id IS NOT NULL
      AND (advisories_confirmed_none = 1 OR EXISTS (SELECT 1 FROM core_production_advisories WHERE production_id = ${id}))`)
    .expect(1, { code: 'core.production.changed', reason: 'Someone else changed this production just now.', remedy: 'Refresh and try again.' })
  unit.audit({ action: 'state', record: ['core.production', id], detail: { from: row.state, to: 'published' } })
  unit.announce('core.production.published', { productionId: id }, { record: ['core.production', id] })
}

/** Published to withdrawn: off the public site, its page and dates no longer answer. */
export async function withdrawProduction(unit: UnitView, id: string): Promise<void> {
  const row = await productionRow(id)
  if (row.state === 'withdrawn') return
  unit.add(sql`UPDATE core_productions SET state = 'withdrawn' WHERE id = ${id} AND state = 'published'`)
    .expect(1, { code: 'core.production.not-published', reason: 'Only a published production can be withdrawn.' })
  unit.audit({ action: 'state', record: ['core.production', id], detail: { from: row.state, to: 'withdrawn' } })
  unit.announce('core.production.withdrawn', { productionId: id }, { record: ['core.production', id] })
}

/** The scheduled performances of a production that have not started, which a cancel takes with it. */
async function performancesToCancel(id: string): Promise<{ id: string }[]> {
  return all<{ id: string }>("SELECT id FROM core_performances WHERE production_id = ? AND state = 'scheduled' AND starts_at > ? ORDER BY starts_at, id", id, nowMs())
}

/** What cancelling the production would touch: its own performances first, then every module's lines. */
export async function productionCancelImpact(id: string, actor: Actor): Promise<{ lines: string[], refusal: { code: string, reason: string, link: string | null } | null }> {
  await productionRow(id)
  const change = { record: { type: 'core.production', id }, kind: 'cancel' as const }
  const count = (await performancesToCancel(id)).length
  const own = count ? [`${count} scheduled performance${count === 1 ? '' : 's'} still to come will be cancelled with the same reason.`] : []
  const refused = await firstRefusal(change, actor)
  return { lines: [...own, ...await changeImpact(change, actor)], refusal: refused ? { code: refused.code, reason: refused.reason, link: refused.link ?? null } : null }
}

/**
 * Published or withdrawn to cancelled, with a reason (part 3). Every scheduled performance that has
 * not started is cancelled in the same batch with the same reason; drafts stay drafts. Any module
 * may refuse through the change guard.
 */
export async function cancelProduction(unit: UnitView, id: string, input: { reasonTermId: string, note?: string | null }, actor: Actor): Promise<{ performances: number }> {
  const row = await productionRow(id)
  if (row.state !== 'published' && row.state !== 'withdrawn') refuse('core.production.not-cancellable', 'Only a published or withdrawn production can be cancelled.', { status: 409, remedy: row.state === 'draft' ? 'Delete the draft instead.' : undefined })
  const reason = await first<{ slug: string }>('SELECT slug FROM core_terms WHERE id = ? AND vocabulary_key = \'core.cancel-reason\' AND retired_at IS NULL', input.reasonTermId)
  if (!reason) refuse('core.production.reason-unknown', 'Choose a reason from the list.', { status: 422, fields: { reasonTermId: 'Choose a reason from the list.' } })
  const refused = await firstRefusal({ record: { type: 'core.production', id }, kind: 'cancel' }, actor)
  if (refused) refuse(refused.code, refused.reason, { status: 409, ...(refused.link ? { remedy: refused.link } : {}) })

  const at = nowMs()
  const changed = { code: 'core.production.changed', reason: 'Someone else changed this production or its dates just now.', remedy: 'Refresh and try again.' }
  unit.add(sql`UPDATE core_productions SET state = 'cancelled', cancel_reason_term_id = ${input.reasonTermId}
    WHERE id = ${id} AND state = ${row.state} AND ${assertTerm(input.reasonTermId, 'core.cancel-reason')}`).expect(1, changed)
  const cancelled = await performancesToCancel(id)
  if (cancelled.length) {
    unit.add(sql`UPDATE core_performances SET state = 'cancelled', cancelled_at = ${at}, cancel_reason_term_id = ${input.reasonTermId}, cancel_note = ${input.note ?? null}
      WHERE production_id = ${id} AND state = 'scheduled' AND id IN (SELECT value FROM json_each(${JSON.stringify(cancelled.map(p => p.id))}))`).expect(cancelled.length, changed)
    unit.announce('core.performance.cancelled', cancelled.map(p => ({ payload: { performanceId: p.id, productionId: id, reason: reason.slug }, record: ['core.performance', p.id] as ['core.performance', string] })))
    syncProductionDates(unit, id)
  }
  unit.audit({ action: 'state', record: ['core.production', id], detail: { from: row.state, to: 'cancelled', reason: reason.slug, performances: cancelled.length } })
  unit.announce('core.production.cancelled', { productionId: id, reason: reason.slug }, { record: ['core.production', id] })
  return { performances: cancelled.length }
}

/** Cancelled back to withdrawn (part 3). Its performances stay cancelled and are reinstated one by one. */
export async function restoreProduction(unit: UnitView, id: string): Promise<void> {
  const row = await productionRow(id)
  if (row.state !== 'cancelled') refuse('core.production.not-cancelled', 'Only a cancelled production can be brought back.', { status: 409 })
  unit.add(sql`UPDATE core_productions SET state = 'withdrawn', cancel_reason_term_id = NULL WHERE id = ${id} AND state = 'cancelled'`)
    .expect(1, { code: 'core.production.changed', reason: 'Someone else changed this production just now.', remedy: 'Refresh and try again.' })
  unit.audit({ action: 'state', record: ['core.production', id], detail: { from: 'cancelled', to: 'withdrawn' } })
  unit.announce('core.production.withdrawn', { productionId: id }, { record: ['core.production', id] })
}

/** Deletes a draft that was never published. Once performances exist, none may have left draft. */
export async function deleteProduction(unit: UnitView, id: string): Promise<void> {
  await productionRow(id)
  // Its draft performances go with it; one that ever left draft keeps the production.
  const deletable = sql`EXISTS (SELECT 1 FROM core_productions WHERE id = ${id} AND state = 'draft' AND published_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM core_performances WHERE production_id = ${id} AND state <> 'draft')`
  unit.add(sql`DELETE FROM core_performances WHERE production_id = ${id} AND ${deletable}`)
  unit.add(sql`DELETE FROM core_productions WHERE id = ${id} AND ${deletable}`)
    .expect(1, { code: 'core.production.not-deletable', reason: 'Only a draft that was never published, with no performance scheduled, can be deleted.', remedy: 'Withdraw it instead.' })
  unit.audit({ action: 'delete', record: ['core.production', id] })
}
