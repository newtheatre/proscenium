// The old estate's programme, catalogue and schedule rather than a person (K-113). 0059's
// NOT_ANONYMISED guard is unused: nothing here is keyed to a user.
import { nanoid } from './lib'
import { londonDayOf } from '../shared/utils/ledger'
import type { Database } from 'bun:sqlite'

// Same declaration as `tickets.refunded_at`, which `migration/money.ts` confirmed against real
// data holds milliseconds despite its `mode: 'timestamp'` name; applied here, not reconfirmed.
const MILLISECOND_FLOOR = 10_000_000_000
function toSeconds(epoch: number): number {
  return epoch >= MILLISECOND_FLOOR ? Math.floor(epoch / 1000) : epoch
}

// The old vocabulary has four values, the new one three: SUITABLE_BREAK and ANY_TIME both narrow
// to ADMITTED, since the new estate does not distinguish "at a suitable break" from "any time".
export const LATECOMER_MAP: Record<string, string> = {
  SUITABLE_BREAK: 'ADMITTED',
  ANY_TIME: 'ADMITTED',
  INTERVAL_ONLY: 'AT_INTERVAL',
  NOT_ADMITTED: 'NOT_ADMITTED',
}

export interface OldVenue {
  id: string
  name: string
  address: string | null
  capacity: number | null
  description: string | null
  is_external: number
}

export interface OldSeason {
  id: string
  name: string
  starts_at: number
  ends_at: number
  sort: number
  archived: number
}

export interface OldShowCategory {
  id: string
  name: string
  sort: number
}

export interface OldShow {
  id: string
  slug: string
  title: string
  subtitle: string | null
  description: string | null
  long_description: string | null
  external_url: string | null
  category_id: string | null
  season_id: string | null
  age_guidance: string | null
  latecomer_policy: string | null
  content_warning_notes: string | null
  warnings_confirmed_none: number
  status: string
  created_at: string
  updated_at: string
}

export interface OldContentWarning {
  id: string
  slug: string
  title: string
  kind: string
  category: string | null
  description: string | null
  icon: string | null
  sort: number
  archived: number
}

export interface OldShowContentWarning {
  id: string
  show_id: string
  content_warning_id: string
  level: string | null
}

export interface OldPerformance {
  id: string
  show_id: string
  venue_id: string
  starts_at: number
  doors_at: number | null
  duration_minutes: number | null
  interval_count: number
  interval_minutes: number | null
  capacity_override: number | null
  booking_closes_hours_before: number | null
  external_booking_url: string | null
  status: string
  notes: string | null
  created_at: string
}

export interface TransformInput {
  // The old proscenium database, read only.
  source: Database
  // Old id to unified id, per entity, read back before minting so a rehearsal never duplicates.
  venueIds: Map<string, string>
  seasonIds: Map<string, string>
  categoryIds: Map<string, string>
  showIds: Map<string, string>
  warningIds: Map<string, string>
  performanceIds: Map<string, string>
  target: Database
}

export interface Summary {
  venues: number
  seasons: number
  categories: number
  shows: number
  droppedExternalUrls: number
  narrowedLatecomerPolicies: number
  contentWarnings: number
  showContentWarnings: number
  performances: number
}

function idFor(map: Map<string, string>, key: string): string {
  const existing = map.get(key)
  if (existing) return existing
  const fresh = nanoid()
  map.set(key, fresh)
  return fresh
}

function parseUtc(stamp: string): number {
  return toSeconds(new Date(`${stamp.replace(' ', 'T')}Z`).getTime())
}

// One pass, dependency order throughout: venues and seasons before shows, shows before
// performances and their warnings, because every later insert is a real foreign key (0043).
export function transformProgramme(input: TransformInput): { summary: Summary, exceptions: string[] } {
  const { source, venueIds, seasonIds, categoryIds, showIds, warningIds, performanceIds, target } = input
  const exceptions: string[] = []
  let droppedExternalUrls = 0
  let narrowedLatecomerPolicies = 0

  const venues = source.query('SELECT id, name, address, capacity, description, is_external FROM venues').all() as OldVenue[]
  for (const venue of venues) {
    // No blob storage is migrated (image_url is a legacy URL, not an R2 key this estate can
    // read): image_key ships null, and the committee re-uploads a poster where one mattered.
    target.query(`
      INSERT INTO venues (id, name, address, capacity, is_external, image_key, description, room_id, created_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, unixepoch())
      ON CONFLICT (id) DO UPDATE SET
        name = excluded.name, address = excluded.address, capacity = excluded.capacity,
        is_external = excluded.is_external, description = excluded.description
    `).run(idFor(venueIds, venue.id), venue.name, venue.address, venue.capacity, venue.is_external, venue.description)
  }

  const seasons = source.query('SELECT id, name, starts_at, ends_at, sort, archived FROM seasons').all() as OldSeason[]
  for (const season of seasons) {
    const startsOn = londonDayOf(new Date(toSeconds(season.starts_at) * 1000))
    const endsOn = londonDayOf(new Date(toSeconds(season.ends_at) * 1000))
    if (endsOn <= startsOn) {
      exceptions.push(`season ${season.id} (${season.name}): ends ${endsOn} does not fall after starts ${startsOn}, not imported`)
      continue
    }
    target.query(`
      INSERT INTO seasons (id, name, starts_on, ends_on, sort, archived)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        name = excluded.name, starts_on = excluded.starts_on, ends_on = excluded.ends_on,
        sort = excluded.sort, archived = excluded.archived
    `).run(idFor(seasonIds, season.id), season.name, startsOn, endsOn, season.sort, season.archived)
  }

  const categories = source.query('SELECT id, name, sort FROM show_categories').all() as OldShowCategory[]
  for (const category of categories) {
    target.query(`
      INSERT INTO show_categories (id, name, sort) VALUES (?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET name = excluded.name, sort = excluded.sort
    `).run(idFor(categoryIds, category.id), category.name, category.sort)
  }

  const shows = source.query(`
    SELECT id, slug, title, subtitle, description, long_description, external_url, category_id,
           season_id, age_guidance, latecomer_policy, content_warning_notes, warnings_confirmed_none,
           status, created_at, updated_at
    FROM shows
  `).all() as OldShow[]
  for (const show of shows) {
    if (show.external_url) droppedExternalUrls++

    const categoryId = show.category_id ? categoryIds.get(show.category_id) ?? null : null
    const seasonId = show.season_id ? seasonIds.get(show.season_id) ?? null : null
    if (show.category_id && !categoryId) exceptions.push(`show ${show.id} (${show.slug}): category ${show.category_id} did not import, left uncategorised`)

    let latecomerPolicy: string | null = null
    if (show.latecomer_policy) {
      latecomerPolicy = LATECOMER_MAP[show.latecomer_policy] ?? null
      if (!latecomerPolicy) exceptions.push(`show ${show.id} (${show.slug}): unknown latecomer policy ${show.latecomer_policy}, left unset`)
      else if (show.latecomer_policy === 'SUITABLE_BREAK' || show.latecomer_policy === 'ANY_TIME') narrowedLatecomerPolicies++
    }

    target.query(`
      INSERT INTO shows
        (id, slug, title, subtitle, description, long_description, poster_key, category_id, season_id,
         age_guidance, latecomer_policy, warnings_confirmed_none, content_notes, booking_closes_hours_before,
         status, production_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        slug = excluded.slug, title = excluded.title, subtitle = excluded.subtitle,
        description = excluded.description, long_description = excluded.long_description,
        category_id = excluded.category_id, season_id = excluded.season_id, age_guidance = excluded.age_guidance,
        latecomer_policy = excluded.latecomer_policy, warnings_confirmed_none = excluded.warnings_confirmed_none,
        content_notes = excluded.content_notes, status = excluded.status, updated_at = excluded.updated_at
    `).run(
      idFor(showIds, show.id), show.slug, show.title, show.subtitle, show.description, show.long_description,
      categoryId, seasonId, show.age_guidance, latecomerPolicy, show.warnings_confirmed_none,
      show.content_warning_notes, show.status, parseUtc(show.created_at), parseUtc(show.updated_at),
    )
  }

  const warnings = source.query('SELECT id, slug, title, kind, category, description, icon, sort, archived FROM content_warnings').all() as OldContentWarning[]
  for (const warning of warnings) {
    target.query(`
      INSERT INTO content_warnings (id, slug, title, kind, category, description, icon, sort, archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        slug = excluded.slug, title = excluded.title, kind = excluded.kind, category = excluded.category,
        description = excluded.description, icon = excluded.icon, sort = excluded.sort, archived = excluded.archived
    `).run(idFor(warningIds, warning.id), warning.slug, warning.title, warning.kind, warning.category, warning.description, warning.icon, warning.sort, warning.archived)
  }

  let showContentWarningsWritten = 0
  const links = source.query('SELECT id, show_id, content_warning_id, level FROM show_content_warnings').all() as OldShowContentWarning[]
  for (const link of links) {
    const showId = showIds.get(link.show_id)
    const warningId = warningIds.get(link.content_warning_id)
    if (!showId || !warningId) {
      exceptions.push(`show_content_warnings ${link.id}: show or warning did not import, link dropped`)
      continue
    }
    target.query(`
      INSERT INTO show_content_warnings (id, show_id, warning_id, level) VALUES (?, ?, ?, ?)
      ON CONFLICT (show_id, warning_id) DO UPDATE SET level = excluded.level
    `).run(nanoid(), showId, warningId, link.level)
    showContentWarningsWritten++
  }

  let performancesWritten = 0
  const performances = source.query(`
    SELECT id, show_id, venue_id, starts_at, doors_at, duration_minutes, interval_count, interval_minutes,
           capacity_override, booking_closes_hours_before, external_booking_url, status, notes, created_at
    FROM performances
  `).all() as OldPerformance[]
  for (const performance of performances) {
    const showId = showIds.get(performance.show_id)
    const venueId = venueIds.get(performance.venue_id)
    if (!showId || !venueId) {
      exceptions.push(`performance ${performance.id}: show or venue did not import, not written`)
      continue
    }
    const startsAt = toSeconds(performance.starts_at)
    const doorsAt = performance.doors_at === null ? null : toSeconds(performance.doors_at)
    const createdAt = parseUtc(performance.created_at)

    target.query(`
      INSERT INTO performances
        (id, show_id, venue_id, starts_at, doors_at, duration_minutes, interval_count, interval_minutes,
         capacity_override, booking_closes_hours_before, hold_release_minutes_before, external_booking_url,
         status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        show_id = excluded.show_id, venue_id = excluded.venue_id, starts_at = excluded.starts_at,
        doors_at = excluded.doors_at, duration_minutes = excluded.duration_minutes,
        interval_count = excluded.interval_count, interval_minutes = excluded.interval_minutes,
        capacity_override = excluded.capacity_override, booking_closes_hours_before = excluded.booking_closes_hours_before,
        external_booking_url = excluded.external_booking_url, status = excluded.status, notes = excluded.notes,
        updated_at = excluded.updated_at
    `).run(
      idFor(performanceIds, performance.id), showId, venueId, startsAt, doorsAt, performance.duration_minutes,
      performance.interval_count, performance.interval_minutes, performance.capacity_override,
      performance.booking_closes_hours_before, performance.external_booking_url, performance.status,
      performance.notes, createdAt, createdAt,
    )
    performancesWritten++
  }

  return {
    summary: {
      venues: venues.length,
      seasons: seasons.length,
      categories: categories.length,
      shows: shows.length,
      droppedExternalUrls,
      narrowedLatecomerPolicies,
      contentWarnings: warnings.length,
      showContentWarnings: showContentWarningsWritten,
      performances: performancesWritten,
    },
    exceptions,
  }
}

export interface Reconciliation {
  ok: boolean
  problems: string[]
}

// Counts per table, plus a total-seconds checksum a row count cannot catch (the same discipline
// `migration/bookings.ts` already applies to its own times).
export function reconcile(source: Database, target: Database, summary: Summary): Reconciliation {
  const problems: string[] = []

  const counted: [string, string, number][] = [
    ['venues', 'venues', summary.venues],
    ['seasons', 'seasons', summary.seasons],
    ['show_categories', 'show_categories', summary.categories],
    ['shows', 'shows', summary.shows],
    ['content_warnings', 'content_warnings', summary.contentWarnings],
  ]
  for (const [table, targetTable, expected] of counted) {
    const landed = (target.query(`SELECT count(*) AS n FROM "${targetTable}"`).get() as { n: number }).n
    if (landed < expected) problems.push(`${table}: read ${expected}, only ${landed} landed in the target`)
  }

  const landedPerformances = (target.query('SELECT count(*) AS n FROM performances').get() as { n: number }).n
  if (landedPerformances < summary.performances) {
    problems.push(`performances: transformed ${summary.performances}, only ${landedPerformances} landed in the target`)
  }

  // Converted per row, in SQL, the same threshold `toSeconds()` uses: a source mixing units
  // (unlikely, but never assumed) still sums correctly, which summing the raw column first would not.
  const sourceRows = source.query('SELECT count(*) AS n FROM performances').get() as { n: number }
  const sourceSeconds = (source.query(
    'SELECT coalesce(sum(CASE WHEN starts_at >= 10000000000 THEN starts_at / 1000 ELSE starts_at END), 0) AS total FROM performances',
  ).get() as { total: number }).total
  const targetSeconds = (target.query('SELECT coalesce(sum(starts_at), 0) AS total FROM performances').get() as { total: number }).total

  if (summary.performances === sourceRows.n && sourceSeconds !== targetSeconds) {
    problems.push(`performance start times differ in total: ${sourceSeconds}s in the source, ${targetSeconds}s in the target`)
  }

  return { ok: problems.length === 0, problems }
}
