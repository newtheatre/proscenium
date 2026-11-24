// What other modules add to the public site (C-69, C-71 to C-73): sections on production and venue
// pages, and the site's front page, menu and production address while a condition holds. A
// contributor that fails is treated as not applying, so the theatre's own site always shows.
import { usePoint } from '#kit'
import type { PageSection } from './points/page-section'
import type { FrontPage, MenuEntry, ProductionAddress, SiteMenu } from './points/site-shape'

export interface ShownSection { id: string, component: string }
export interface SiteShape {
  frontPage: string | null
  menu: MenuEntry[]
  footer: MenuEntry[]
  /** The prefix production pages live at while a contributor moves them; null keeps /whats-on and /shows. */
  productionBase: string | null
}

async function holds(test: () => Promise<boolean>): Promise<boolean> {
  try {
    return await test()
  }
  catch {
    return false
  }
}

/** The sections a production's or a venue's page draws, in order. */
export async function sectionsFor(point: 'public-site.production-section' | 'public-site.venue-section', id: string): Promise<ShownSection[]> {
  const shown: ShownSection[] = []
  for (const s of await usePoint<PageSection>(point)) {
    if (await holds(() => s.value.appliesTo(id))) shown.push({ id: s.id, component: s.value.component })
  }
  return shown
}

/** Every contributor of a point that applies now, in manifest order. */
export async function applying<T extends { appliesWhen: () => Promise<boolean> }>(point: string): Promise<{ id: string, module: string, value: T }[]> {
  const found = []
  for (const c of await usePoint<T>(point)) {
    if (await holds(() => c.value.appliesWhen())) found.push(c)
  }
  return found
}

async function entries(menus: { value: SiteMenu }[], which: 'entries' | 'footer'): Promise<MenuEntry[]> {
  const out: MenuEntry[] = []
  for (const m of menus) {
    try {
      out.push(...(await m.value[which]()).map(e => ({ ...e, order: e.order ?? 0 })))
    }
    catch {
      // A menu that fails adds nothing.
    }
  }
  return out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export async function siteShape(): Promise<SiteShape> {
  const [front, menus, base] = await Promise.all([applying<FrontPage>('public-site.front-page'), applying<SiteMenu>('public-site.menu'), productionBase()])
  return { frontPage: front[0]?.value.component ?? null, menu: await entries(menus, 'entries'), footer: await entries(menus, 'footer'), productionBase: base }
}

/** The prefix production pages live at while a module moves them (C-73), or null for /whats-on and /shows. */
export async function productionBase(): Promise<string | null> {
  const [first] = await applying<ProductionAddress>('public-site.production-address')
  return first?.value.base.replace(/^\/+|\/+$/g, '') || null
}
