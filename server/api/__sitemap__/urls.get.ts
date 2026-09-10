import { queryCollection } from '@nuxt/content/nitro'
import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { isCrawlable } from '#shared/utils/seo'
import { PUBLIC_NAV } from '#shared/utils/site-nav'

interface ListedShow { slug: string, updatedAt: number }

// Deliberately public: the sitemap module fetches this to build /sitemap.xml (K-125). Only what a
// visitor opens without an account is listed, and the robots disallow list is the final filter.
export default defineEventHandler(async (event) => {
  const at = Math.floor(Date.now() / 1000)

  const [pages, shows, modules] = await Promise.all([
    queryCollection(event, 'content').select('path').all(),
    // The same scope the what's-on listing uses: published, with a performance still to come.
    db.all<ListedShow>(sql`
      SELECT s.slug AS slug, s.updated_at AS updatedAt FROM shows s
      WHERE s.status = 'PUBLISHED'
        AND EXISTS (SELECT 1 FROM performances p
                     WHERE p.show_id = s.id AND p.status = 'ON_SALE' AND p.starts_at >= ${at})
      ORDER BY s.slug
    `),
    listModules({ includeDrafts: false, includeRetired: false }, await academicYear(event), false),
  ])

  const urls = new Map<string, { loc: string, lastmod?: string }>()
  const add = (loc: string, lastmod?: string): void => {
    if (isCrawlable(loc) && !urls.has(loc)) urls.set(loc, lastmod ? { loc, lastmod } : { loc })
  }

  add('/')
  for (const entry of PUBLIC_NAV) add(entry.to)
  for (const page of pages) add(page.path)
  for (const show of shows) add(`/shows/${show.slug}`, new Date(show.updatedAt * 1000).toISOString())
  for (const module of modules) add(`/training/modules/${module.id}`)

  return [...urls.values()]
})
