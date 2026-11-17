// Guidance for a production (content warnings, staging effects and age): the one read every module
// uses wherever someone decides, so booking, emails and the front of house briefing agree. Part 5,
// "Later slice: guidance for a production". Core does not know who calls it.
import { all, first, nowMs, siteUrl } from '#kit'

export type WarningLevel = 'mentioned' | 'discussed' | 'depicted'

export const LEVELS: readonly WarningLevel[] = ['depicted', 'discussed', 'mentioned'] // most serious first

export interface GuidanceWarning {
  termId: string
  label: string
  description: string | null
  heading: string | null
  /** Null while a row carried over from before levels existed has not been graded (it shows no level word). */
  level: WarningLevel | null
  detail: string | null
}

export interface GuidanceEffect { termId: string, label: string, description: string | null, icon: string | null, detail: string | null }

export interface Guidance {
  ageMin: number | null
  ageRestricted: boolean
  effects: GuidanceEffect[]
  /** Labels of the production's effects switched off for the performance asked about (C-55). Empty when none, or no performance was asked about. */
  notAtThisPerformance: string[]
  warnings: GuidanceWarning[]
  contentNote: string | null
  effectsAnswered: boolean
  warningsAnswered: boolean
}

export interface BeforeYouCome {
  ageMin: number | null
  ageRestricted: boolean
  effects: { termId: string, label: string, detail: string | null }[]
  notAtThisPerformance: string[]
  hasContentWarnings: boolean
  pageUrl: string
  empty: boolean
}

interface SortKey { level: WarningLevel | null, headingSort: number, termSort: number }

/**
 * The order content warnings are shown in, derived and never stored: depicted, then discussed,
 * then mentioned; within a level by heading order, then term order. A row with no level yet comes
 * last, because it says nothing about how serious it is.
 */
export function orderWarnings<T extends SortKey>(warnings: readonly T[]): T[] {
  const rank = (level: WarningLevel | null) => (level ? LEVELS.indexOf(level) : LEVELS.length)
  return [...warnings].sort((a, b) => rank(a.level) - rank(b.level) || a.headingSort - b.headingSort || a.termSort - b.termSort)
}

/** Whichever of two levels is the more serious: where a merge brings two onto one production, the more serious stands. */
export function graver(a: WarningLevel, b: WarningLevel): WarningLevel {
  return LEVELS.indexOf(a) <= LEVELS.indexOf(b) ? a : b
}

interface WarningRow {
  term_id: string
  label: string
  description: string | null
  heading: string | null
  heading_sort: number | null
  term_sort: number
  level: WarningLevel
  level_assumed: number
  detail: string | null
}

/**
 * A production's content warnings in their derived order. A term merged into another shows once,
 * under the surviving term's label, at the more serious level where both were listed.
 */
export async function productionWarnings(productionId: string): Promise<GuidanceWarning[]> {
  const rows = await all<WarningRow>(
    `SELECT s.id AS term_id, s.label, s.description, g.label AS heading, g.sort AS heading_sort, s.sort AS term_sort,
        a.level, a.level_assumed, a.detail
      FROM core_production_advisories a
      JOIN core_terms t ON t.id = a.term_id
      JOIN core_terms s ON s.id = coalesce(t.merged_into_id, t.id)
      LEFT JOIN core_term_groups g ON g.id = s.group_id
      WHERE a.production_id = ?`,
    productionId,
  )
  const merged = new Map<string, WarningRow>()
  for (const row of rows) {
    const seen = merged.get(row.term_id)
    if (!seen) {
      merged.set(row.term_id, row)
      continue
    }
    merged.set(row.term_id, { ...seen, level: graver(seen.level, row.level), level_assumed: seen.level_assumed && row.level_assumed ? 1 : 0, detail: seen.detail ?? row.detail })
  }
  return orderWarnings([...merged.values()].map(r => ({
    termId: r.term_id, label: r.label, description: r.description, heading: r.heading,
    level: r.level_assumed ? null : r.level, detail: r.detail,
    headingSort: r.heading_sort ?? Number.MAX_SAFE_INTEGER, termSort: r.term_sort,
  }))).map(({ headingSort: _h, termSort: _t, ...w }) => w)
}

export async function productionEffects(productionId: string): Promise<GuidanceEffect[]> {
  const rows = await all<{ term_id: string, label: string, description: string | null, icon: string | null, detail: string | null }>(
    `SELECT s.id AS term_id, s.label, s.description, s.icon, e.detail
      FROM core_production_effects e
      JOIN core_terms t ON t.id = e.term_id
      JOIN core_terms s ON s.id = coalesce(t.merged_into_id, t.id)
      WHERE e.production_id = ? GROUP BY s.id ORDER BY s.sort, lower(s.label)`,
    productionId,
  )
  return rows.map(r => ({ termId: r.term_id, label: r.label, description: r.description, icon: r.icon, detail: r.detail }))
}

/** The effects (surviving term ids, merges followed) a performance does not use. */
async function effectsOffFor(performanceId: string): Promise<Set<string>> {
  const rows = await all<{ term_id: string }>(
    'SELECT coalesce(t.merged_into_id, t.id) AS term_id FROM core_performance_effect_exceptions x JOIN core_terms t ON t.id = x.term_id WHERE x.performance_id = ?',
    performanceId,
  )
  return new Set(rows.map(r => r.term_id))
}

/**
 * Everything the audience is told before they decide: the age, the effects with their details, the
 * content warnings with level and detail in their derived order, the content note, and whether
 * each of the two questions has been answered. Public data only.
 */
export async function guidanceFor(productionId: string, performanceId?: string): Promise<Guidance | null> {
  const row = await first<{ age_min: number | null, age_restricted: number, content_note: string | null, effects_confirmed_none: number, advisories_confirmed_none: number }>(
    'SELECT age_min, age_restricted, content_note, effects_confirmed_none, advisories_confirmed_none FROM core_productions WHERE id = ?', productionId)
  if (!row) return null
  const [allEffects, warnings, off] = await Promise.all([productionEffects(productionId), productionWarnings(productionId), performanceId ? effectsOffFor(performanceId) : Promise.resolve(new Set<string>())])
  const effects = allEffects.filter(e => !off.has(e.termId))
  return {
    ageMin: row.age_min,
    ageRestricted: !!row.age_restricted,
    effects,
    notAtThisPerformance: allEffects.filter(e => off.has(e.termId)).map(e => e.label),
    warnings,
    contentNote: row.content_note,
    effectsAnswered: !!row.effects_confirmed_none || allEffects.length > 0,
    warningsAnswered: !!row.advisories_confirmed_none || warnings.length > 0,
  }
}

/**
 * What is safe to put in an inbox, which is not private: the age, the effects, whether content
 * warnings exist (never how many or which) and a link to the page. A module renders all of it
 * without choosing fields, so no content warning's label can reach a message by mistake.
 */
export async function beforeYouCome(productionId: string, performanceId?: string): Promise<BeforeYouCome | null> {
  const row = await first<{ slug: string, state: string, last_ends_at: number | null }>('SELECT slug, state, last_ends_at FROM core_productions WHERE id = ?', productionId)
  const guidance = row ? await guidanceFor(productionId, performanceId) : null
  if (!row || !guidance) return null
  const past = row.state === 'cancelled' || (row.last_ends_at !== null && row.last_ends_at <= nowMs())
  return {
    ageMin: guidance.ageMin,
    ageRestricted: guidance.ageRestricted,
    effects: guidance.effects.map(e => ({ termId: e.termId, label: e.label, detail: e.detail })),
    notAtThisPerformance: guidance.notAtThisPerformance,
    hasContentWarnings: guidance.warnings.length > 0,
    pageUrl: await siteUrl(`/${past ? 'shows' : 'whats-on'}/${row.slug}`),
    empty: guidance.ageMin === null && !guidance.effects.length && !guidance.warnings.length,
  }
}

/** How a minimum age reads on a card or a page: a recommendation, or a rule. Null where no age is set. */
export function ageWording(ageMin: number | null, restricted: boolean): string | null {
  if (ageMin === null) return null
  return restricted ? `${ageMin} and over only` : `Recommended for ${ageMin} and over`
}
