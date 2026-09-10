import { queryCollection } from '@nuxt/content/nitro'
import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { PUBLIC_NAV } from '#shared/utils/site-nav'

interface ListedShow { slug: string, updatedAt: number }
interface ContentPage { path: string, placeholder: boolean }

// Deliberately public: the sitemap module fetches this to build /sitemap.xml (K-125), and drops
// anything the robots rules disallow, so no second filter is applied here.
export default defineEventHandler(async (event) => {
  const at = Math.floor(Date.now() / 1000)

  const [pages, shows, modules] = await Promise.all([
    queryCollection(event, 'content').select('path', 'placeholder').all() as Promise<ContentPage[]>,
    db.all<ListedShow>(sql`
      SELECT s.slug AS slug, s.updated_at AS updatedAt FROM shows s
      WHERE ${listedShowPredicate(at)}
      ORDER BY s.slug
    `),
    db.all<{ id: string }>(sql`SELECT id FROM modules WHERE status = 'ACTIVE' ORDER BY id`),
  ])

  // A placeholder page is honest about not being the committee's words yet; it is not offered.
  const content = new Map(pages.map(page => [page.path, page.placeholder]))
  const urls = new Map<string, { loc: string, lastmod?: string }>()
  const add = (loc: string, lastmod?: string): void => {
    if (content.get(loc) === true || urls.has(loc)) return
    urls.set(loc, lastmod ? { loc, lastmod } : { loc })
  }

  add('/')
  for (const entry of PUBLIC_NAV) add(entry.to)
  for (const page of pages) add(page.path)
  for (const show of shows) add(`/shows/${show.slug}`, new Date(show.updatedAt * 1000).toISOString())
  for (const module of modules) add(`/training/modules/${module.id}`)

  // A bare array is the shape the module's `sources` contract reads; an envelope would be ignored.
  return [...urls.values()]
})
