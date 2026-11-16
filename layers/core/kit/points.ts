// Points: named, typed sockets. usePoint returns the contributions of every module that is on.
import { useRegistry } from './registry'
import { enabledModules } from './modules-store'

export interface PointContribution<V = unknown> {
  id: string
  module: string
  /** For a data point, the entry itself; for a code point, the contributed file's default export. */
  value: V
}

export async function usePoint<V = any>(name: string): Promise<PointContribution<V>[]> {
  const registry = useRegistry()
  const point = registry.points.get(name)
  if (!point) throw new Error(`"${name}" is not a declared point`)
  const on = await enabledModules()
  const out: PointContribution<V>[] = []
  for (const entry of registry.modules.values()) {
    if (!on.has(entry.manifest.id)) continue
    for (const c of entry.manifest.contributes?.[name] ?? []) {
      const value = point.decl.kind === 'data' ? c : (entry.handlers.contributions?.[name]?.[c.file ?? c.id] as any)
      out.push({ id: c.id, module: entry.manifest.id, value: value as V })
    }
  }
  return out.sort((a, b) => (((a.value as any)?.order ?? 0) - ((b.value as any)?.order ?? 0)))
}
