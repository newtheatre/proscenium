// Policies (/policies/<id>): every section file is well formed, and everything it quotes or tests
// exists, is public and cannot come out empty. A policy that says nothing where a figure should be
// is worse than no policy, so an unset value must be guarded or given a fallback.
import type { Loaded } from '../lib/load.ts'
import { collectPolicies } from '../lib/policies.ts'
import { readConditions, sectionTokens, type PolicyCondition } from '../../layers/core/shared/policies.ts'

const TABLES = ['cookies', 'browser-storage', 'suppliers', 'supplier-cookies', 'privacy-records']
const SETTING_KEY = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/ // not-policy: the shape of a setting's key

export function checkPolicies(modules: Loaded[], registry: any): string[] {
  const { sections, problems } = collectPolicies(modules)
  const out = [...problems]
  const settings = registry.settings as Map<string, { module: string, entry: any }>
  const ids = new Set(modules.map(m => m.manifest.id))
  const contributed = (point: string) => modules.flatMap(m => (((m.manifest.contributes ?? {}) as Record<string, any[]>)[point] ?? []).map(value => ({ module: m.manifest.id, value })))
  const facts = new Set(contributed('core.policy-fact').map(c => c.value.id as string))

  const condition = (c: PolicyCondition, where: string) => {
    const name = c.setting ?? c.has
    if (name !== undefined) {
      const found = settings.get(name)
      if (!found) out.push(`${where}: tests the setting "${name}", which does not exist`)
      else if ((found.entry.audience ?? 'staff') !== 'public') out.push(`${where}: tests "${name}", which a visitor's browser may not know; give the setting audience: 'public'`)
    }
    if (c.fact !== undefined && !facts.has(c.fact)) out.push(`${where}: tests the fact "${c.fact}", which no module contributes to core.policy-fact`)
    if (c.module !== undefined && !ids.has(c.module)) out.push(`${where}: tests the module "${c.module}", which does not exist`)
  }

  for (const s of sections) {
    const tokens = sectionTokens(s.body)
    for (const p of tokens.problems) out.push(`${s.file}: ${p.message} (line ${p.line} of the text)`)
    for (const c of s.when) condition(c, s.file)
    for (const c of tokens.conditions) condition(c.condition, s.file)
    for (const t of tokens.tables) if (!TABLES.includes(t.kind)) out.push(`${s.file}: there is no policy table "${t.kind}"; the tables are ${TABLES.join(', ')}`)
    for (const f of tokens.facts) if (!facts.has(f.name)) out.push(`${s.file}: quotes the fact "${f.name}", which no module contributes to core.policy-fact`)
    for (const q of tokens.settings) {
      const found = settings.get(q.name)
      // Whether it exists and is quotable is the content check's to say; here, whether it can come out empty.
      if (!found) continue
      const guarded = q.guarded || q.fallback || s.when.some(c => c.has === q.name)
      if (found.entry.unset && !guarded) out.push(`${s.file}: quotes "${q.name}", which has no value until the theatre sets one; put it inside ::when{has="${q.name}"} or give the token a fallback`)
      // A section is shown while its own module is on; another module's setting may not be there.
      if (s.owner === 'upstream' && found.module !== 'core' && found.module !== s.module) out.push(`${s.file}: quotes "${q.name}", which belongs to ${found.module}; that module may be off while ${s.module} is on, so move the words to ${found.module}'s own section`)
    }
  }

  // The lines modules declare for the generated tables: a time given as a setting's key must be a quotable setting.
  const time = (words: unknown, where: string) => {
    if (typeof words !== 'string' || !SETTING_KEY.test(words)) return
    const found = settings.get(words)
    if (!found) out.push(`${where}: names the setting "${words}", which does not exist`)
    else if (!found.entry.quotable || (found.entry.audience ?? 'staff') !== 'public') out.push(`${where}: names "${words}", which must be public and quotable to be shown in a policy`)
  }
  for (const c of contributed('core.browser-storage')) time(c.value.lasts, `${c.module}: core.browser-storage "${c.value.id}"`)
  for (const c of contributed('core.privacy-record')) time(c.value.keptFor, `${c.module}: core.privacy-record "${c.value.id}"`)
  for (const c of contributed('core.supplier')) {
    const where = `${c.module}: core.supplier "${c.value.id}"`
    const found: string[] = []
    for (const parsed of readConditions(c.value.when ?? '', found)) condition(parsed, where)
    for (const message of found) out.push(`${where}: ${message}`)
  }
  return out
}
