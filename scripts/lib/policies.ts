// Collects every policy section: each module's content/policies/<policy>/<section>.md and the
// theatre's site/content/policies/<policy>/<section>.md, with their front matter read and checked.
// The generator writes them to .generated/policies.ts, which the server imports, so a policy is
// put together without reading a file or the content database at run time.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './paths.ts'
import type { Loaded } from './load.ts'
import { parseSection, shortHash, type PolicySection } from '../../layers/core/shared/policies.ts'

export const SITE_POLICIES = 'site/content/policies'
/** The file in a theatre's own policy folder that declares the policy: its title, order and kind. */
export const DECLARATION = '_policy.md'
export const POLICY_KINDS = ['notice', 'terms', 'rules', 'statement'] as const

export interface SitePolicy { id: string, title: string, order: number, kind: typeof POLICY_KINDS[number], file: string }
export interface PolicyBundle { sections: PolicySection[], sitePolicies: SitePolicy[], problems: string[] }

const NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/ // not-policy: the shape of an address part

function folders(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort() : []
}
function files(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.md')).sort() : []
}

function readDeclaration(file: string, id: string, problems: string[]): SitePolicy | null {
  const source = readFileSync(join(ROOT, file), 'utf8')
  const fields: Record<string, string> = {}
  for (const line of (/^---\n([\s\S]*?)\n---/.exec(source.replace(/\r\n?/g, '\n'))?.[1] ?? '').split('\n')) {
    const at = line.indexOf(':')
    if (at > 0) fields[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  const kind = (fields.kind ?? 'notice') as SitePolicy['kind']
  if (!fields.title) problems.push(`${file}: needs a title in its front matter`)
  if (!POLICY_KINDS.includes(kind)) problems.push(`${file}: kind is one of ${POLICY_KINDS.join(', ')}`)
  const order = Number(fields.order ?? 100) // not-policy: after upstream's policies unless the theatre says otherwise
  if (!Number.isInteger(order)) problems.push(`${file}: order is a whole number`)
  return fields.title ? { id, title: fields.title, order, kind, file } : null
}

/** Every section and every policy the theatre declares, with what is wrong with any of them. */
export function collectPolicies(modules: Pick<Loaded, 'found' | 'manifest'>[]): PolicyBundle {
  const sections: PolicySection[] = []
  const sitePolicies: SitePolicy[] = []
  const problems: string[] = []
  const declared = new Set<string>()
  for (const m of modules) for (const p of m.manifest.contributes?.['core.policy'] ?? []) declared.add(p.id)

  const read = (dir: string, module: string, owner: PolicySection['owner']) => {
    for (const policy of folders(join(ROOT, dir))) {
      const base = `${dir}/${policy}`
      if (!NAME.test(policy)) problems.push(`${base}: a policy's folder is lower-case words joined by hyphens`)
      if (module === 'site' && existsSync(join(ROOT, base, DECLARATION))) {
        if (declared.has(policy)) problems.push(`${base}/${DECLARATION}: "${policy}" is already a module's policy; remove this file to add sections to it, or pick another name`)
        else {
          const own = readDeclaration(`${base}/${DECLARATION}`, policy, problems)
          if (own) sitePolicies.push(own)
        }
      }
      for (const name of files(join(ROOT, base))) {
        if (name === DECLARATION) continue
        const file = `${base}/${name}`
        const id = name.replace(/\.md$/, '')
        if (!NAME.test(id)) problems.push(`${file}: a section's file is lower-case words joined by hyphens`)
        const parsed = parseSection(readFileSync(join(ROOT, file), 'utf8'))
        for (const p of parsed.problems) problems.push(`${file}: ${p}`)
        const f = parsed.fields
        const own = module === 'site'
        if (!own) {
          if (!f.title) problems.push(`${file}: needs a title`)
          if (f.order === undefined) problems.push(`${file}: needs an order`)
          if (f.hidden !== undefined || f.basedOn !== undefined) problems.push(`${file}: hidden and based-on are for a theatre's own file under ${SITE_POLICIES}`)
        }
        else if (f.hidden && !f.reason) problems.push(`${file}: a hidden section gives its reason in one line`)
        sections.push({
          policy, id, module, owner, file,
          title: f.title ?? '',
          order: f.order ?? Number.NaN,
          revised: f.revised,
          when: f.when ?? [],
          law: f.law ?? (own ? 'inherit' : 'any'),
          hidden: f.hidden,
          reason: f.reason,
          basedOn: f.basedOn,
          mustWrite: f.mustWrite,
          material: f.material,
          body: parsed.body,
          hash: shortHash(`${f.title ?? ''}\n${parsed.body}`),
        })
      }
    }
  }
  for (const m of modules) read(`${m.found.root}/content/policies`, m.manifest.id, m.found.owner === 'site' ? 'site' : 'upstream')
  read(SITE_POLICIES, 'site', 'site')

  const known = new Set([...declared, ...sitePolicies.map(p => p.id)])
  const seen = new Map<string, string>()
  for (const s of sections) {
    if (!known.has(s.policy)) problems.push(`${s.file}: "${s.policy}" is not a policy. ${s.module === 'site' ? `Add ${SITE_POLICIES}/${s.policy}/${DECLARATION} to declare it, or move the file into one of: ${[...declared].sort().join(', ')}` : 'A module declares a policy through core.policy'}`)
    if (s.module === 'site') {
      const base = sections.find(o => o.module !== 'site' && o.policy === s.policy && o.id === s.id)
      if (!base && (s.hidden || s.basedOn)) problems.push(`${s.file}: replaces no section; no module has ${s.policy}/${s.id}.md`)
      if (!base && !s.hidden && !s.title) problems.push(`${s.file}: needs a title`)
      if (base && !s.hidden && !s.title) s.title = base.title
      continue
    }
    const key = `${s.policy}/${s.id}`
    const other = seen.get(key)
    if (other) problems.push(`${s.file}: ${other} already has a section named ${s.id} in ${s.policy}; a section's name is unique within its policy`)
    else seen.set(key, s.file)
  }
  return { sections, sitePolicies, problems }
}

export function policiesSource(bundle: PolicyBundle): string {
  // NaN does not survive JSON: an order left out is written as null and read back as NaN.
  const sections = JSON.stringify(bundle.sections, (_key, value) => typeof value === 'number' && Number.isNaN(value) ? null : value, 2)
  return `// Generated by scripts/generate.ts. Do not edit.
import type { PolicySection } from '../layers/core/shared/policies'

export const sections: PolicySection[] = (${sections} as (Omit<PolicySection, 'order'> & { order: number | null })[]).map(s => ({ ...s, order: s.order ?? Number.NaN }))
export const sitePolicies: { id: string, title: string, order: number, kind: 'notice' | 'terms' | 'rules' | 'statement', file: string }[] = ${JSON.stringify(bundle.sitePolicies, null, 2)}
`
}
