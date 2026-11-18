// What the policies still lack before a theatre should rely on them, for the site-readiness
// screen: sections only the theatre can write, replacements that upstream's wording has since
// moved on from, facts about the theatre the text would state if it knew them, and default text
// nobody has yet said they reviewed.
import { useSetting } from '#kit'
import { sections as allSections } from '#policies'
import { sectionTokens } from '../../shared/policies'
import { listPolicies, policyContext, resolvePolicy } from './service'

export interface PolicyReadinessItem {
  kind: 'unwritten' | 'stale' | 'setting' | 'unreviewed'
  /** The policy's title, with the section's after a colon where the line is about one. */
  name: string
  to: string
  /** The file to write or to compare, from the repository's root. */
  file?: string
  /** The setting to give a value, for a `setting` line. */
  key?: string
}

/** Facts about the theatre a policy reads thinner without. Others (a charity number) not every theatre has. */
const EXPECTED = ['core.organisation.legal-name', 'core.organisation.contact-email', 'core.privacy.contact']
const SETTINGS_PAGE: Record<string, string> = { 'core.privacy.contact': '/admin/privacy' }
const REVIEWED = '/admin/theatre?setting=core.policies.reviewed'

export async function policyReadiness(): Promise<PolicyReadinessItem[]> {
  const items: PolicyReadinessItem[] = []
  const context = await policyContext()
  const reviewed = new Set(await useSetting('core.policies.reviewed') as string[])
  const wanted = new Set<string>()
  for (const policy of await listPolicies()) {
    const resolved = await resolvePolicy(policy.id, context)
    if (!resolved) continue
    const to = `/policies/${policy.id}`
    for (const s of resolved.unwritten) items.push({ kind: 'unwritten', name: `${policy.title}: ${s.title}`, to, file: `site/content/policies/${policy.id}/${s.id}.md` })
    for (const { section, upstream } of resolved.stale) items.push({ kind: 'stale', name: `${policy.title}: ${upstream.title}`, to, file: section.file })
    for (const s of resolved.sections) {
      const tokens = sectionTokens(s.body)
      for (const name of [...tokens.settings.map(q => q.name), ...tokens.conditions.map(c => c.condition.has ?? ''), ...s.when.map(c => c.has ?? '')]) if (EXPECTED.includes(name)) wanted.add(name)
    }
    // A policy of the theatre's own is the theatre's wording already; upstream's defaults want a reader.
    const upstream = allSections.some(s => s.policy === policy.id && s.owner === 'upstream')
    if (upstream && !reviewed.has(policy.id)) items.push({ kind: 'unreviewed', name: policy.title, to: REVIEWED })
  }
  for (const key of EXPECTED) {
    const value = context.settings[key]?.value
    if (wanted.has(key) && (value === null || value === undefined || value === '')) items.push({ kind: 'setting', name: key, key, to: `${SETTINGS_PAGE[key] ?? '/admin/theatre'}?setting=${encodeURIComponent(key)}` })
  }
  return items
}
