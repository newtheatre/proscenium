// The programme's public addresses, for the sitemap search engines read (public site; C-47): every
// listed production under the address its page lives at (/whats-on while it is on, /shows once it is
// past), every active venue and every published season. Past productions and archived seasons are
// left out while past shows are not public. Drafts, withdrawn and unlisted productions never appear.
import { all, nowMs } from '#kit'

/** `productionBase`, while a module moves production pages (C-73), puts every production under it instead. */
export async function publicProgrammePaths(options: { pastVisible?: boolean, now?: number, productionBase?: string | null } = {}): Promise<string[]> {
  const pastVisible = options.pastVisible ?? true
  const now = options.now ?? nowMs()
  const productions = await all<{ slug: string, past: number }>(
    `SELECT p.slug, (p.state = 'cancelled' OR (p.last_ends_at IS NOT NULL AND p.last_ends_at <= ?)) AS past
       FROM core_productions p
      WHERE p.listed = 1 AND p.state IN ('published', 'cancelled')
        AND EXISTS (SELECT 1 FROM core_performances f WHERE f.production_id = p.id AND f.state <> 'draft')
      ORDER BY p.slug`,
    now,
  )
  const venues = await all<{ slug: string }>('SELECT slug FROM core_venues WHERE state = \'active\' ORDER BY slug')
  const seasons = await all<{ slug: string }>(
    `SELECT slug FROM core_seasons WHERE state = 'published' ${pastVisible ? 'OR state = \'archived\'' : ''} ORDER BY slug`,
  )
  return [
    ...productions.filter(p => pastVisible || !p.past).map(p => `/${options.productionBase ?? (p.past ? 'shows' : 'whats-on')}/${p.slug}`),
    ...venues.map(v => `/venues/${v.slug}`),
    ...seasons.map(s => `/seasons/${s.slug}`),
  ]
}
