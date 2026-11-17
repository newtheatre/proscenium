// The archive of past productions as the public sees it (C-43, C-46): by year, or found by title,
// company or a credited name. Past is worked out as on the production page: cancelled, or its last
// performance not cancelled has ended. Unlisted productions keep their page but stay out of the
// archive, as they stay out of what's on. Whether the archive is public at all, and how far back it
// goes, are the public site's settings; the caller passes the earliest year.
//
// The search reads the public text only: titles, the visiting company, and credits that are public
// on a production whose credits are public. A hidden credit, or one shown only to members, is never
// found. It matches by LIKE rather than a search index; a theatre's archive is thousands of rows,
// not millions, and an index on productions and credits can come when lists of them need one.
import { all, nowMs, searchWords, theatreTimeZone } from '#kit'
import { instantOfLocal, localParts } from '#kit/clock'
import { publicImages, type PublicImage } from './media'
import type { PublicTerm } from './public'

export interface ArchiveEntry {
  id: string
  slug: string
  title: string
  subtitle: string | null
  companyName: string | null
  category: PublicTerm | null
  /** The first performance's start: drafts left out, cancelled ones counted. */
  openedAt: number
  /** The last performance's end, on the same terms. */
  closedAt: number
  cancelled: boolean
  venues: string[]
  poster: PublicImage | null
}

export interface ArchiveYear {
  year: number
  count: number
}

export interface Archive {
  /** Every year with a past production, newest first, from the earliest year shown. */
  years: ArchiveYear[]
  /** The year shown, or null when searching or when the archive is empty. */
  year: number | null
  /** What was searched for, folded, when something was. */
  words: string[]
  /** Something was typed but every word was under three letters. */
  searchTooShort: boolean
  /** The year's productions, newest first; or the best matches across every year. */
  productions: ArchiveEntry[]
}

export interface ArchiveOptions {
  /** A year to show; one with nothing in it shows the newest year instead. */
  year?: number
  /** Words to find in a title, a company or a public credit. */
  q?: string
  /** The earliest year shown (public-site.archive.from-year). */
  fromYear?: number | null
  now?: number
}

/** Matches found at most, across every year. */
const MATCHES = 60 // not-policy: a bound on one answer, not a choice a theatre makes

// Past, listed, and with at least one performance that is not a draft to date it by.
const PAST = `
  SELECT p.id, min(f.starts_at) AS opened_at, max(f.ends_at) AS closed_at
    FROM core_productions p
    JOIN core_performances f ON f.production_id = p.id AND f.state <> 'draft'
   WHERE p.listed = 1
     AND (p.state = 'cancelled' OR (p.state = 'published' AND p.last_ends_at IS NOT NULL AND p.last_ends_at <= ?))
   GROUP BY p.id
  HAVING min(f.starts_at) >= ?`

// Every word must match somewhere public: the title, the company, or one public credit's name.
const MATCHING = `
  AND NOT EXISTS (
    SELECT 1 FROM json_each(?) w
     WHERE NOT (
       lower(p.title) LIKE '%' || w.value || '%' ESCAPE '\\'
       OR lower(coalesce(p.company_name, '')) LIKE '%' || w.value || '%' ESCAPE '\\'
       OR (p.credits_public = 1 AND EXISTS (
         SELECT 1 FROM core_production_credits c
          WHERE c.production_id = p.id AND c.visibility = 'public'
            AND lower(c.credited_name) LIKE '%' || w.value || '%' ESCAPE '\\')))
  )`

const like = (word: string) => word.replace(/[\\%_]/g, m => `\\${m}`)

/** The archive: one year's past productions, or those matching a search across every year. */
export async function pastProductions(options: ArchiveOptions = {}): Promise<Archive> {
  const now = options.now ?? nowMs()
  const zone = await theatreTimeZone()
  const from = options.fromYear ? yearStart(options.fromYear, zone) : Number.MIN_SAFE_INTEGER
  const dated = await all<{ id: string, opened_at: number }>(PAST, now, from)

  const counts = new Map<number, number>()
  for (const r of dated) {
    const year = localParts(r.opened_at, zone).year
    counts.set(year, (counts.get(year) ?? 0) + 1)
  }
  const years = [...counts].map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year)
  const search = searchWords(options.q)

  if (search.words.length) {
    // LIKE folds only ASCII case, so the words are lower-cased here and the columns in the query.
    const rows = await entries(PAST, [now, from], `${MATCHING} ORDER BY d.closed_at DESC, p.id LIMIT ${MATCHES}`, [JSON.stringify(search.words.map(like))])
    return { years, year: null, words: search.words, searchTooShort: false, productions: rows }
  }
  const year = options.year && counts.has(options.year) ? options.year : years[0]?.year ?? null
  if (year === null) return { years, year, words: [], searchTooShort: search.searchTooShort, productions: [] }
  const rows = await entries(PAST, [now, from], 'AND d.opened_at >= ? AND d.opened_at < ? ORDER BY d.opened_at DESC, p.id', [yearStart(year, zone), yearStart(year + 1, zone)])
  return { years, year, words: [], searchTooShort: search.searchTooShort, productions: rows }
}

async function entries(past: string, pastParams: unknown[], tail: string, tailParams: unknown[]): Promise<ArchiveEntry[]> {
  const rows = await all<{ id: string, slug: string, title: string, subtitle: string | null, company_name: string | null, state: string, category_id: string | null, category_slug: string | null, category_label: string | null, opened_at: number, closed_at: number, venues: string }>(
    `SELECT p.id, p.slug, p.title, p.subtitle, p.company_name, p.state, c.id AS category_id, c.slug AS category_slug, c.label AS category_label,
        d.opened_at, d.closed_at,
        (SELECT json_group_array(DISTINCT v.name) FROM core_performances f JOIN core_venues v ON v.id = f.venue_id
          WHERE f.production_id = p.id AND f.state <> 'draft') AS venues
       FROM (${past}) d
       JOIN core_productions p ON p.id = d.id
       LEFT JOIN core_terms c ON c.id = p.category_term_id
      WHERE 1 = 1 ${tail}`,
    ...pastParams, ...tailParams,
  )
  const images = await publicImages(rows.map(r => r.id))
  return rows.map(r => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    subtitle: r.subtitle,
    companyName: r.company_name,
    category: r.category_id ? { id: r.category_id, slug: r.category_slug!, label: r.category_label! } : null,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    cancelled: r.state === 'cancelled',
    venues: (JSON.parse(r.venues) as string[]).sort(),
    poster: images.get(r.id)!.poster,
  }))
}

/** The instant a year begins where the theatre is. */
function yearStart(year: number, zone: string): number {
  return instantOfLocal(`${String(year).padStart(4, '0')}-01-01`, '00:00', zone)
}
