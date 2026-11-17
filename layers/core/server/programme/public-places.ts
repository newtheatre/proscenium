// Venues and seasons as the public sees them (part 6, public shell: the Venue and Season pages; C-48).
// Only public fields. A venue answers while it is active; a season while it is published or archived.
// Whether an archived season is public is the public site's setting (C-47), as for past shows; the
// caller says so with `pastVisible`, and past productions in a season are left out with it.
import { all, first, nowMs } from '#kit'
import { publicImages, type PublicImage } from './media'
import type { PublicTerm } from './public'

export interface PublicFeature {
  termId: string
  label: string
  icon: string | null
  note: string | null
}

export interface PublicSpace {
  id: string
  slug: string
  name: string
  description: string | null
  findingIt: string | null
  accessInfo: string | null
  access: PublicFeature[]
}

export interface PublicVenue {
  id: string
  slug: string
  name: string
  address: { lines: string[], locality: string | null, postcode: string | null, country: string | null }
  location: { latitude: number, longitude: number } | null
  description: string | null
  accessInfo: string | null
  gettingHere: string | null
  access: PublicFeature[]
  /** Active spaces audiences go to: those that can hold a performance. */
  spaces: PublicSpace[]
}

interface VenueRow {
  id: string
  slug: string
  name: string
  address_lines: string | null
  locality: string | null
  postcode: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  description: string | null
  access_info: string | null
  getting_here: string | null
}

/** One active venue by its slug, with its access features and its performance spaces; null if none. */
export async function publicVenue(slug: string): Promise<PublicVenue | null> {
  const v = await first<VenueRow>(
    `SELECT id, slug, name, address_lines, locality, postcode, country, latitude, longitude, description, access_info, getting_here
       FROM core_venues WHERE slug = ? AND state = 'active'`,
    slug,
  )
  if (!v) return null
  const spaces = await all<{ id: string, slug: string, name: string, description: string | null, finding_it: string | null, access_info: string | null }>(
    `SELECT id, slug, name, description, finding_it, access_info FROM core_spaces
      WHERE venue_id = ? AND state = 'active' AND performable = 1 ORDER BY sort, lower(name)`,
    v.id,
  )
  const features = await all<{ space_id: string | null, term_id: string, label: string, icon: string | null, note: string | null }>(
    `SELECT a.space_id, a.term_id, t.label, t.icon, a.note FROM core_place_access a JOIN core_terms t ON t.id = a.term_id
      WHERE a.venue_id = ? ORDER BY a.sort, t.sort`,
    v.id,
  )
  const of = (spaceId: string | null) => features.filter(f => f.space_id === spaceId).map(f => ({ termId: f.term_id, label: f.label, icon: f.icon, note: f.note }))
  return {
    id: v.id,
    slug: v.slug,
    name: v.name,
    address: { lines: (v.address_lines ?? '').split('\n').map(l => l.trim()).filter(Boolean), locality: v.locality, postcode: v.postcode, country: v.country },
    location: v.latitude !== null && v.longitude !== null ? { latitude: v.latitude, longitude: v.longitude } : null,
    description: v.description,
    accessInfo: v.access_info,
    gettingHere: v.getting_here,
    access: of(null),
    // Only spaces the venue holds performances in; a store or an office is not somewhere to find.
    spaces: spaces.map(s => ({ id: s.id, slug: s.slug, name: s.name, description: s.description, findingIt: s.finding_it, accessInfo: s.access_info, access: of(s.id) })),
  }
}

export interface SeasonProduction {
  id: string
  slug: string
  title: string
  subtitle: string | null
  summary: string | null
  category: PublicTerm | null
  /** The first performance that is not a draft; null while it has none. */
  firstStartsAt: number | null
  lastEndsAt: number | null
  cancelled: boolean
  /** Worked out as on the production page: cancelled, or its last performance has ended. */
  past: boolean
  poster: PublicImage | null
}

export interface PublicSeason {
  id: string
  slug: string
  name: string
  startsOn: string
  endsOn: string
  summary: string | null
  archived: boolean
  productions: SeasonProduction[]
}

/**
 * One published or archived season by its slug, with its listed productions in the order they open.
 * Null for a draft or unknown season, and for an archived one while past shows are not public; its
 * past productions are left out then too.
 */
export async function publicSeason(slug: string, options: { pastVisible?: boolean, now?: number } = {}): Promise<PublicSeason | null> {
  const pastVisible = options.pastVisible ?? true
  const s = await first<{ id: string, slug: string, name: string, starts_on: string, ends_on: string, summary: string | null, state: string }>(
    'SELECT id, slug, name, starts_on, ends_on, summary, state FROM core_seasons WHERE slug = ? AND state IN (\'published\', \'archived\')',
    slug,
  )
  if (!s || (s.state === 'archived' && !pastVisible)) return null
  const now = options.now ?? nowMs()
  const rows = await all<{ id: string, slug: string, title: string, subtitle: string | null, summary: string | null, state: string, category_id: string | null, category_slug: string | null, category_label: string | null, last_ends_at: number | null, opened_at: number | null, closed_at: number | null }>(
    `SELECT p.id, p.slug, p.title, p.subtitle, p.summary, p.state, c.id AS category_id, c.slug AS category_slug, c.label AS category_label,
        p.last_ends_at,
        (SELECT min(starts_at) FROM core_performances WHERE production_id = p.id AND state <> 'draft') AS opened_at,
        (SELECT max(ends_at) FROM core_performances WHERE production_id = p.id AND state <> 'draft') AS closed_at
       FROM core_productions p LEFT JOIN core_terms c ON c.id = p.category_term_id
      WHERE p.season_id = ? AND p.state IN ('published', 'cancelled') AND p.listed = 1
      ORDER BY opened_at IS NULL, opened_at, lower(p.title), p.id`,
    s.id,
  )
  const images = await publicImages(rows.map(r => r.id))
  const productions = rows.map((r) => {
    const past = r.state === 'cancelled' || (r.last_ends_at !== null && r.last_ends_at <= now)
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      subtitle: r.subtitle,
      summary: r.summary,
      category: r.category_id ? { id: r.category_id, slug: r.category_slug!, label: r.category_label! } : null,
      firstStartsAt: r.opened_at,
      lastEndsAt: r.closed_at,
      cancelled: r.state === 'cancelled',
      past,
      poster: images.get(r.id)!.poster,
    }
  })
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    startsOn: s.starts_on,
    endsOn: s.ends_on,
    summary: s.summary,
    archived: s.state === 'archived',
    productions: pastVisible ? productions : productions.filter(p => !p.past),
  }
}
