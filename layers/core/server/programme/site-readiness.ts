// What the core holds that a public site still lacks (C-42, C-48, part 2's migration lines), for the
// public site's readiness screen: brand items not yet given, public images with no text description,
// venues with no access recorded, and productions the content warnings migration left unfinished.
// Each item says where it is put right. The theatre's own pages are the public site's to read.
import { all, useSetting } from '#kit'
import { policyReadiness, type PolicyReadinessItem } from '../policies/readiness'

export interface ReadinessItem {
  /** What the line is about: a production's title, a venue's name; absent for the brand's own. */
  name?: string
  to: string
}

export interface CoreReadiness {
  /** Brand items not yet given: the theatre's name and its logo. */
  brand: { item: 'name' | 'logo', to: string }[]
  /** Public images with no text description: the logos, and published productions' images. */
  images: (ReadinessItem & { item: 'logo' | 'logo-dark' | 'production' })[]
  /** Active venues with no access features recorded (C-48): absence is not a claim. */
  venues: ReadinessItem[]
  /** Productions with a content warning whose level the migration assumed. */
  levelsAssumed: ReadinessItem[]
  /** Published productions with no answer on staging effects. */
  effectsUnanswered: ReadinessItem[]
  /** What the policies (/policies) still lack: sections to write, facts to give, default text to review. */
  policies: PolicyReadinessItem[]
}

const BRANDING = '/admin/branding'
const production = (tab: string) => (r: { id: string, title: string }) => ({ name: r.title, to: `/console/programme/productions/${r.id}?tab=${tab}` })

async function logoWithoutText(key: 'core.brand.logo' | 'core.brand.logo-dark'): Promise<boolean> {
  const id = await useSetting(key) as string | null
  if (!id) return false
  const rows = await all<{ id: string }>("SELECT id FROM core_files WHERE id = ? AND state = 'ready' AND trim(coalesce(alt_text, '')) = ''", id)
  return rows.length > 0
}

export async function coreReadiness(): Promise<CoreReadiness> {
  const brand: CoreReadiness['brand'] = []
  if (!await useSetting('core.site.name')) brand.push({ item: 'name', to: '/admin/theatre?setting=core.site.name' })
  if (!await useSetting('core.brand.logo')) brand.push({ item: 'logo', to: BRANDING })

  const images: CoreReadiness['images'] = []
  if (await logoWithoutText('core.brand.logo')) images.push({ item: 'logo', to: BRANDING })
  if (await logoWithoutText('core.brand.logo-dark')) images.push({ item: 'logo-dark', to: BRANDING })
  // A public image cannot be attached without a description, but one can be cleared afterwards.
  const undescribed = await all<{ id: string, title: string }>(`SELECT DISTINCT p.id, p.title FROM core_files f
    JOIN core_productions p ON f.owner_type = 'core.production' AND f.owner_id = p.id
    WHERE p.state = 'published' AND f.state = 'ready' AND f.attached_at IS NOT NULL AND f.access = 'public'
      AND f.media_type LIKE 'image/%' AND trim(coalesce(f.alt_text, '')) = '' ORDER BY p.title`)
  images.push(...undescribed.map(r => ({ item: 'production' as const, ...production('media')(r) })))

  const venues = await all<{ id: string, name: string }>(`SELECT v.id, v.name FROM core_venues v WHERE v.state = 'active'
    AND NOT EXISTS (SELECT 1 FROM core_place_access a WHERE a.venue_id = v.id) ORDER BY v.name`)

  const levelsAssumed = await all<{ id: string, title: string }>(`SELECT DISTINCT p.id, p.title FROM core_productions p
    JOIN core_production_advisories a ON a.production_id = p.id WHERE a.level_assumed = 1 ORDER BY p.title`)
  const effectsUnanswered = await all<{ id: string, title: string }>(`SELECT p.id, p.title FROM core_productions p
    WHERE p.state = 'published' AND p.effects_confirmed_none = 0
      AND NOT EXISTS (SELECT 1 FROM core_production_effects e WHERE e.production_id = p.id) ORDER BY p.title`)

  return {
    brand,
    images,
    venues: venues.map(v => ({ name: v.name, to: `/admin/modules/core/venues/${v.id}` })),
    levelsAssumed: levelsAssumed.map(production('advisories')),
    effectsUnanswered: effectsUnanswered.map(production('advisories')),
    policies: await policyReadiness(),
  }
}
