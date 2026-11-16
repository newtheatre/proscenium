// Finds every module and loads its manifest and handler files, the same way for the generator,
// the checks, migration generation and the test configuration.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createJiti } from 'jiti'
import { ROOT, KIT, abs, rel } from './paths.ts'
import { kitAliases } from '../../layers/core/aliases.ts'

export type Owner = 'upstream' | 'site' | 'fixtures'
export const FIXTURES = { dir: 'tests/fixtures/modules', owner: 'fixtures' as const }
/** The gallery: a module of fixture screens the browser tests open. Only a build made for those tests includes it. */
export const GALLERY = { dir: 'tests/fixtures/gallery', owner: 'fixtures' as const }
export const ROOTS: { dir: string, owner: Owner }[] = [
  { dir: 'layers', owner: 'upstream' },
  { dir: 'site/layers', owner: 'site' },
  ...(process.env.PROSCENIUM_GALLERY === '1' ? [GALLERY] : []),
]

export interface HandlerFile { kind: 'listeners' | 'jobs' | 'tasks' | 'facts' | 'calls' | 'contributions', name: string, point?: string, file: string }
export interface FoundModule { root: string, owner: Owner, manifestFile: string, handlerFiles: HandlerFile[] }

export const jiti = createJiti(import.meta.url, {
  // The same aliases as the app, so a handler may import another module's services (#modules/<id>).
  alias: { ...kitAliases(ROOT), '#kit': KIT },
  moduleCache: true,
  fsCache: false,
  interopDefault: true,
})

const ts = (dir: string) => existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts')).map(f => f.slice(0, -3)) : []

export function findModules(roots = ROOTS): FoundModule[] {
  const out: FoundModule[] = []
  for (const { dir, owner } of roots) {
    const base = abs(dir)
    if (!existsSync(base)) continue
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const root = `${dir}/${entry.name}`
      const manifestFile = join(ROOT, root, 'module.ts')
      if (!existsSync(manifestFile)) continue
      const handlerFiles: HandlerFile[] = []
      for (const kind of ['listeners', 'jobs', 'tasks', 'facts', 'calls'] as const) {
        for (const name of ts(join(ROOT, root, 'server', kind))) handlerFiles.push({ kind, name, file: `${root}/server/${kind}/${name}.ts` })
      }
      const contributions = join(ROOT, root, 'server/contributions')
      if (existsSync(contributions)) {
        for (const point of readdirSync(contributions)) {
          for (const name of ts(join(contributions, point))) handlerFiles.push({ kind: 'contributions', point, name, file: `${root}/server/contributions/${point}/${name}.ts` })
        }
      }
      out.push({ root, owner, manifestFile, handlerFiles })
    }
  }
  return out
}

export class LoadError extends Error {}

/** Loads a manifest; a DeclarationError comes back naming the file and the field. */
export async function loadManifest(found: FoundModule): Promise<any> {
  try {
    const manifest = await jiti.import(found.manifestFile, { default: true })
    return manifest
  }
  catch (error: any) {
    if (error?.name === 'DeclarationError') throw new LoadError(`${rel(found.manifestFile)}: ${error.field}: ${error.message.replace(/^.*?: /, '').replace(`${error.field}: `, '')}`)
    throw new LoadError(`${rel(found.manifestFile)}: ${error?.message ?? error}`)
  }
}

/** The handler map the registry wants, keyed as the manifest names them. */
export async function loadHandlers(found: FoundModule, manifest: any): Promise<Record<string, any>> {
  const handlers: Record<string, any> = { listeners: {}, jobs: {}, tasks: {}, facts: {}, calls: {}, contributions: {} }
  const prefix = `${manifest.id}.`
  for (const h of found.handlerFiles) {
    let value: unknown
    try { value = await jiti.import(join(ROOT, h.file), { default: true }) }
    catch (error: any) { throw new LoadError(`${h.file}: ${error?.message ?? error}`) }
    if (h.kind === 'listeners') handlers.listeners[h.name] = value
    else if (h.kind === 'contributions') (handlers.contributions[h.point!] ??= {})[h.name] = value
    else if (h.kind === 'facts') handlers.facts[`${prefix}${h.name}`] = value
    else handlers[h.kind][`${prefix}${h.name}`] = value
  }
  return handlers
}

/** A handler key as the generated registry writes it. */
export function handlerKey(manifestId: string, h: HandlerFile): string {
  return h.kind === 'listeners' || h.kind === 'contributions' ? h.name : `${manifestId}.${h.name}`
}

export interface Loaded { found: FoundModule, manifest: any, handlers: Record<string, any> }

/** Loads and cross-checks every module. Throws a LoadError naming the file and field. */
export async function loadRegistry(roots = ROOTS): Promise<{ modules: Loaded[], registry: any }> {
  const modules: Loaded[] = []
  for (const found of findModules(roots)) {
    const manifest = await loadManifest(found)
    if (!manifest || typeof manifest !== 'object' || typeof manifest.id !== 'string') throw new LoadError(`${rel(found.manifestFile)}: (default export): must be defineModule({...})`)
    modules.push({ found, manifest, handlers: await loadHandlers(found, manifest) })
  }
  const { buildRegistry } = await jiti.import<any>(join(KIT, 'registry.ts'))
  try {
    const registry = buildRegistry(modules.map(m => ({ manifest: m.manifest, root: m.found.root, owner: m.found.owner, handlers: m.handlers })))
    return { modules, registry }
  }
  catch (error: any) {
    if (error?.name === 'DeclarationError') throw new LoadError(error.message)
    throw error
  }
}
