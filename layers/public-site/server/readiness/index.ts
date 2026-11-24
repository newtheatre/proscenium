// The site-readiness checklist (C-42; core domain specification, part 6): everything the public site
// still lacks, each with where it is put right or the file to edit, and whether search engines are
// being turned away. The theatre's pages are read here; the rest is the core's (coreReadiness).
import { type RequestEvent } from 'nuxt/server'
import { queryCollection } from '@nuxt/content/server'
import { useSetting } from '#kit'
import { enabledModules } from '#kit/modules-store'
import { useRegistry } from '#kit/registry'
import { coreReadiness, type CoreReadiness } from '#modules/core'
import { readContent, type PageRef } from './content'

export interface SiteReadiness extends CoreReadiness {
  /** Whether search engines are asked to stay away (public-site.search.hidden). */
  hidden: boolean
  /** Every item outstanding, for the Admin overview's card. Turning search engines away is a choice, not an item. */
  outstanding: number
  pages: PageRef[]
  pageImages: (PageRef & { src: string })[]
  /** Components a page uses whose module is switched off: the page shows nothing in their place. */
  components: (PageRef & { tag: string, module: string })[]
  /** Settings a page quotes that are still unset, with where each is set. */
  settings: (PageRef & { key: string, to: string })[]
}

/** The module that provides each component a page may write, by the tag it writes. */
function componentModules(): Map<string, string> {
  const owners = new Map<string, string>()
  for (const [id, { manifest }] of useRegistry().modules) {
    for (const c of (manifest.contributes?.['core.public-component'] ?? []) as { id: string, alias?: string }[]) owners.set(c.alias ?? c.id, id)
  }
  return owners
}

function settingAddress(key: string): string | null {
  const registry = useRegistry()
  const home = registry.settingHomes.get(key)
  if (!home) return null
  const to = home.page ? registry.settingPages.get(home.page)?.to : home.screen
  return to ? `${to}?setting=${encodeURIComponent(key)}` : null
}

export async function siteReadiness(event: RequestEvent): Promise<SiteReadiness> {
  // The collection's types are generated for the app only, so the server names it loosely.
  const pages = await queryCollection(event, 'pages' as never).select('path' as never, 'stem' as never, 'title' as never, 'placeholder' as never, 'body' as never).all() as Parameters<typeof readContent>[0]
  const found = readContent(pages)
  const on = await enabledModules()
  const owners = componentModules()
  const components = found.components.flatMap((c) => {
    const module = owners.get(c.tag)
    return module && !on.has(module) ? [{ ...c, module }] : []
  })
  const settings: SiteReadiness['settings'] = []
  for (const q of found.quoted) {
    const to = settingAddress(q.key)
    // A quoted setting that does not exist fails the build, so one with no home is not a reader's concern.
    if (!to || !on.has(useRegistry().settings.get(q.key)?.module ?? '')) continue
    const value = await useSetting(q.key as never) as unknown
    if (value === null || value === undefined || value === '') settings.push({ ...q, to })
  }
  const core = await coreReadiness()
  const lists = [found.placeholders, found.images, components, settings, core.brand, core.images, core.venues, core.levelsAssumed, core.effectsUnanswered, core.policies]
  return {
    hidden: await useSetting('public-site.search.hidden') as boolean,
    outstanding: lists.reduce((n, l) => n + l.length, 0),
    pages: found.placeholders,
    pageImages: found.images,
    components,
    settings,
    ...core,
  }
}
