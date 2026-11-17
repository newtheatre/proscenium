// The programme as the public sees it (part 4, routes; C-38 and C-39). Only published and cancelled
// productions, only their scheduled, completed and (by choice) cancelled performances, only public
// fields, and credits through shownCredits. The public site's routes read through here, and so may
// any module with a public page of its own, such as Box office's booking pages, whether or not the
// public site is switched on. Whether past shows are public is the public site's setting, not this.
import { all, first, nowMs, theatreTimeZone, useSetting } from '#kit'
import { instantOfLocal, localDateOf } from '#kit/clock'
import { productionBySlug } from './service'
import { ageWording, guidanceFor, type GuidanceEffect, type GuidanceWarning } from './guidance'
import { shownCredits, type ShownCredit } from './credits'
import { bookingActions, type ShownBooking } from './booking'
import { publicImages, type PublicImage } from './media'

export interface PublicTerm { id: string, slug: string, label: string }
export interface PublicNote { termId: string, label: string, detail: string | null }
/** A content warning as the page shows it. A null level is a row nobody has graded yet: no level word. */
export type PublicWarning = Pick<GuidanceWarning, 'termId' | 'label' | 'description' | 'heading' | 'level' | 'detail'>
export type PublicEffect = Pick<GuidanceEffect, 'termId' | 'label' | 'description' | 'icon' | 'detail'>

export interface PublicPerformance {
  id: string
  startsAt: number
  doorsAt: number | null
  endsAt: number
  state: 'scheduled' | 'cancelled' | 'completed'
  label: string | null
  venue: { id: string, slug: string, name: string }
  space: { id: string, name: string }
  access: PublicNote[]
  /** The booking button, or null where there is none (C-39: "where one exists"). */
  booking: ShownBooking | null
}

export interface PublicProduction {
  id: string
  slug: string
  title: string
  subtitle: string | null
  summary: string | null
  description: string | null
  category: PublicTerm | null
  season: { id: string, slug: string, name: string } | null
  companyName: string | null
  /** The age in words, as a recommendation or a rule; null where none is set. */
  ageGuidance: string | null
  ageMin: number | null
  ageRestricted: boolean
  /** Staging effects: always shown, never behind a control. */
  effects: PublicEffect[]
  effectsConfirmedNone: boolean
  /** Content warnings in their derived order, most serious first. */
  advisories: PublicWarning[]
  advisoriesConfirmedNone: boolean
  contentNote: string | null
  runningMinutes: number | null
  intervalCount: number
  state: 'published' | 'cancelled'
  /** Worked out, not stored (part 3): cancelled, or its last performance not cancelled has ended. */
  past: boolean
  credits: ShownCredit[]
  poster: PublicImage | null
  photos: PublicImage[]
  performances: PublicPerformance[]
}

export interface PublicProductionOptions {
  /** Keep cancelled performances that have not yet ended (public-site.listing.cancelled-visible). */
  cancelledVisible?: boolean
  /** Show members-only credits as well, for the members' side. */
  members?: boolean
  now?: number
}

interface ProductionRow {
  id: string
  slug: string
  title: string
  subtitle: string | null
  summary: string | null
  description: string | null
  category_id: string | null
  category_slug: string | null
  category_label: string | null
  season_id: string | null
  season_slug: string | null
  season_name: string | null
  company_name: string | null
  age_min: number | null
  age_restricted: number
  effects_confirmed_none: number
  advisories_confirmed_none: number
  content_note: string | null
  running_minutes: number | null
  interval_count: number
  external_booking_url: string | null
  state: 'published' | 'cancelled'
}

interface PerformanceRow {
  id: string
  production_id: string
  starts_at: number
  doors_at: number | null
  ends_at: number
  state: PublicPerformance['state']
  label: string | null
  capacity: number | null
  external_booking_url: string | null
  venue_id: string
  venue_slug: string
  venue_name: string
  space_id: string
  space_name: string
}

const PRODUCTION = `SELECT p.id, p.slug, p.title, p.subtitle, p.summary, p.description,
    c.id AS category_id, c.slug AS category_slug, c.label AS category_label,
    s.id AS season_id, s.slug AS season_slug, s.name AS season_name,
    p.company_name, p.age_min, p.age_restricted, p.effects_confirmed_none, p.advisories_confirmed_none, p.content_note, p.running_minutes, p.interval_count,
    p.external_booking_url, p.state
  FROM core_productions p
  LEFT JOIN core_terms c ON c.id = p.category_term_id
  LEFT JOIN core_seasons s ON s.id = p.season_id AND s.state IN ('published', 'archived')
  WHERE p.state IN ('published', 'cancelled')`

/**
 * One production by its address. An old slug answers `{ moved }` with the current one, for a
 * redirect; a production the public may not see answers null, as one that never existed would.
 */
export async function publicProduction(slug: string, options: PublicProductionOptions = {}): Promise<PublicProduction | { moved: string } | null> {
  const found = await productionBySlug(slug)
  if (!found) return null
  const row = await first<ProductionRow>(`${PRODUCTION} AND p.id = ?`, found.id)
  if (!row) return null
  if (found.moved) return { moved: found.slug }
  const now = options.now ?? nowMs()
  const performances = await publicPerformances([row], now, options.cancelledVisible ?? true)
  const guidance = (await guidanceFor(row.id))!
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    summary: row.summary,
    description: row.description,
    category: row.category_id ? { id: row.category_id, slug: row.category_slug!, label: row.category_label! } : null,
    season: row.season_id ? { id: row.season_id, slug: row.season_slug!, name: row.season_name! } : null,
    companyName: row.company_name,
    ageGuidance: ageWording(row.age_min, !!row.age_restricted),
    ageMin: row.age_min,
    ageRestricted: !!row.age_restricted,
    effects: guidance.effects,
    effectsConfirmedNone: !!row.effects_confirmed_none,
    advisories: guidance.warnings.map(({ termId, label, description, heading, level, detail }) => ({ termId, label, description, heading, level, detail })),
    advisoriesConfirmedNone: !!row.advisories_confirmed_none,
    contentNote: row.content_note,
    runningMinutes: row.running_minutes,
    intervalCount: row.interval_count,
    state: row.state,
    past: isPast(row.state, performances, now),
    credits: await shownCredits(row.id, options.members ?? false),
    ...(await publicImages([row.id])).get(row.id)!,
    performances,
  }
}

export interface PublicListing {
  id: string
  slug: string
  title: string
  subtitle: string | null
  summary: string | null
  category: PublicTerm | null
  /** The age in words, and whether the show uses staging effects: the compact form of its guidance, for cards. */
  age: string | null
  hasEffects: boolean
  /** The next scheduled performance to start, or the one running now. */
  nextStartsAt: number
  /** The last scheduled performance's end. */
  lastEndsAt: number
  venues: string[]
  poster: PublicImage | null
}

export interface WhatsOnOptions {
  /** A category term's slug. */
  category?: string
  /** A published or archived season's slug. */
  season?: string
  /** A venue's slug: only dates there count. */
  venue?: string
  /** YYYY-MM in the theatre's time zone: only dates starting that month count. */
  month?: string
  /** At most this many, soonest first. */
  limit?: number
  now?: number
}

export interface WhatsOnFilters {
  categories: PublicTerm[]
  seasons: { id: string, slug: string, name: string }[]
  venues: { id: string, slug: string, name: string }[]
  /** YYYY-MM, soonest first, in the theatre's time zone; empty until the time zone is set. */
  months: string[]
}

// A date that is still to come and on sale to the public's eye: scheduled, not yet over, on a
// published, listed production. Filters narrow the dates (venue, month) or the productions.
const UPCOMING = `FROM core_productions p
       JOIN core_performances f ON f.production_id = p.id AND f.state = 'scheduled' AND f.ends_at > ?
       JOIN core_venues v ON v.id = f.venue_id
       LEFT JOIN core_terms c ON c.id = p.category_term_id
       LEFT JOIN core_seasons s ON s.id = p.season_id AND s.state IN ('published', 'archived')
      WHERE p.state = 'published' AND p.listed = 1`

/**
 * What's on (C-38): published, listed productions with a scheduled performance still to come,
 * soonest first, narrowed by category, season, venue or month (the screen's filters, and the
 * whats-on content component's). Unlisted productions keep their page but stay out of lists and feeds.
 */
export async function currentProductions(options: WhatsOnOptions = {}): Promise<PublicListing[]> {
  const now = options.now ?? nowMs()
  const conditions: [string, unknown[]][] = []
  if (options.category) conditions.push(['c.slug = ?', [options.category]])
  if (options.season) conditions.push(['s.slug = ?', [options.season]])
  if (options.venue) conditions.push(['v.slug = ?', [options.venue]])
  if (options.month) {
    const zone = await theatreTimeZone()
    const [y, m] = options.month.split('-').map(Number) as [number, number]
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}` // not-policy: months in a year
    conditions.push(['f.starts_at >= ? AND f.starts_at < ?', [instantOfLocal(`${options.month}-01`, '00:00', zone), instantOfLocal(`${next}-01`, '00:00', zone)]])
  }
  const where = conditions.map(([c]) => c)
  const params = [now, ...conditions.flatMap(([, p]) => p)]
  const limit = options.limit ? ` LIMIT ${Math.max(1, Math.floor(options.limit))}` : ''
  const rows = await all<{ id: string, slug: string, title: string, subtitle: string | null, summary: string | null, category_id: string | null, category_slug: string | null, category_label: string | null, next_starts_at: number, last_ends_at: number, venues: string, age_min: number | null, age_restricted: number, has_effects: number }>(
    `SELECT p.id, p.slug, p.title, p.subtitle, p.summary, c.id AS category_id, c.slug AS category_slug, c.label AS category_label,
        p.age_min, p.age_restricted, EXISTS (SELECT 1 FROM core_production_effects e WHERE e.production_id = p.id) AS has_effects,
        min(f.starts_at) AS next_starts_at, max(f.ends_at) AS last_ends_at,
        json_group_array(DISTINCT v.name) AS venues
       ${UPCOMING}${where.map(w => ` AND ${w}`).join('')}
      GROUP BY p.id
      ORDER BY next_starts_at, p.id${limit}`,
    ...params,
  )
  const images = await publicImages(rows.map(r => r.id))
  return rows.map(r => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    subtitle: r.subtitle,
    summary: r.summary,
    category: r.category_id ? { id: r.category_id, slug: r.category_slug!, label: r.category_label! } : null,
    age: ageWording(r.age_min, !!r.age_restricted),
    hasEffects: !!r.has_effects,
    nextStartsAt: r.next_starts_at,
    lastEndsAt: r.last_ends_at,
    venues: (JSON.parse(r.venues) as string[]).sort(),
    poster: images.get(r.id)!.poster,
  }))
}

/** The choices what's on can be narrowed by: only those that something on now has. */
export async function whatsOnFilters(options: { now?: number } = {}): Promise<WhatsOnFilters> {
  const now = options.now ?? nowMs()
  const rows = await all<{ category_id: string | null, category_slug: string | null, category_label: string | null, category_sort: number | null, season_id: string | null, season_slug: string | null, season_name: string | null, season_starts: string | null, venue_id: string, venue_slug: string, venue_name: string, starts_at: number }>(
    `SELECT c.id AS category_id, c.slug AS category_slug, c.label AS category_label, c.sort AS category_sort,
        s.id AS season_id, s.slug AS season_slug, s.name AS season_name, s.starts_on AS season_starts,
        v.id AS venue_id, v.slug AS venue_slug, v.name AS venue_name, f.starts_at
       ${UPCOMING}`,
    now,
  )
  const zone = await useSetting('core.locale.time-zone') as string | null
  const categories = new Map<string, PublicTerm & { sort: number }>()
  const seasons = new Map<string, { id: string, slug: string, name: string, startsOn: string }>()
  const venues = new Map<string, { id: string, slug: string, name: string }>()
  const months = new Set<string>()
  for (const r of rows) {
    if (r.category_id) categories.set(r.category_id, { id: r.category_id, slug: r.category_slug!, label: r.category_label!, sort: r.category_sort ?? 0 })
    if (r.season_id) seasons.set(r.season_id, { id: r.season_id, slug: r.season_slug!, name: r.season_name!, startsOn: r.season_starts ?? '' })
    venues.set(r.venue_id, { id: r.venue_id, slug: r.venue_slug, name: r.venue_name })
    if (zone) months.add(localDateOf(Math.max(r.starts_at, now), zone).slice(0, 7)) // not-policy: YYYY-MM of YYYY-MM-DD
  }
  return {
    categories: [...categories.values()].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label)).map(({ sort: _, ...c }) => c),
    seasons: [...seasons.values()].sort((a, b) => a.startsOn.localeCompare(b.startsOn)).map(({ startsOn: _, ...s }) => s),
    venues: [...venues.values()].sort((a, b) => a.name.localeCompare(b.name)),
    months: [...months].sort(),
  }
}

async function publicPerformances(productions: ProductionRow[], now: number, cancelledVisible: boolean): Promise<PublicPerformance[]> {
  const byId = new Map(productions.map(p => [p.id, p]))
  // Drafts are never public. A cancelled performance shows only until it would have ended, and only by choice.
  const rows = await all<PerformanceRow>(
    `SELECT f.id, f.production_id, f.starts_at, f.doors_at, f.ends_at, f.state, f.label, f.capacity, f.external_booking_url,
        v.id AS venue_id, v.slug AS venue_slug, v.name AS venue_name, s.id AS space_id, s.name AS space_name
       FROM core_performances f JOIN core_venues v ON v.id = f.venue_id JOIN core_spaces s ON s.id = f.space_id
      WHERE f.production_id IN (SELECT value FROM json_each(?))
        AND (f.state IN ('scheduled', 'completed') OR (f.state = 'cancelled' AND ? AND f.ends_at > ?))
      ORDER BY f.starts_at, f.id`,
    JSON.stringify([...byId.keys()]), cancelledVisible ? 1 : 0, now,
  )
  const access = new Map<string, PublicNote[]>()
  if (rows.length) {
    for (const a of await all<{ performance_id: string, term_id: string, label: string, detail: string | null }>(
      `SELECT a.performance_id, a.term_id, t.label, a.detail FROM core_performance_access a JOIN core_terms t ON t.id = a.term_id
        WHERE a.performance_id IN (SELECT value FROM json_each(?)) ORDER BY t.sort, t.id`,
      JSON.stringify(rows.map(r => r.id)),
    )) access.set(a.performance_id, [...(access.get(a.performance_id) ?? []), { termId: a.term_id, label: a.label, detail: a.detail }])
  }
  // A cancelled production books nothing; otherwise only a scheduled performance not yet over.
  const bookable = rows.filter(r => r.state === 'scheduled' && r.ends_at > now && byId.get(r.production_id)!.state === 'published')
  const booking = await bookingActions(bookable.map(r => ({
    id: r.id,
    productionId: r.production_id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    capacity: r.capacity,
    externalBookingUrl: r.external_booking_url,
    productionBookingUrl: byId.get(r.production_id)!.external_booking_url,
  })))
  return rows.map(r => ({
    id: r.id,
    startsAt: r.starts_at,
    doorsAt: r.doors_at,
    endsAt: r.ends_at,
    state: r.state,
    label: r.label,
    venue: { id: r.venue_id, slug: r.venue_slug, name: r.venue_name },
    space: { id: r.space_id, name: r.space_name },
    access: access.get(r.id) ?? [],
    booking: booking[r.id] ?? null,
  }))
}

function isPast(state: PublicProduction['state'], performances: PublicPerformance[], now: number): boolean {
  if (state === 'cancelled') return true
  const ends = performances.filter(p => p.state !== 'cancelled').map(p => p.endsAt)
  return ends.length > 0 && Math.max(...ends) <= now
}
