// The import aliases every part of the build shares: Nuxt (app and server), Vitest and the scripts.
// `#kit` is the kit, `#registry` the generated registry, `#policies` the generated policy sections, and `#modules/<id>` a module's public
// services (`server/services.ts`), which another module may import only if it lists that module in
// `requires` (the imports check enforces it).
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Module folders in the order the registry reads them: upstream's layers, then the theatre's. */
export function moduleRoots(root: string): string[] {
  const roots: string[] = []
  for (const parent of ['layers', 'site/layers']) {
    const dir = join(root, parent)
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(dir, entry.name, 'module.ts'))) roots.push(join(dir, entry.name))
    }
  }
  return roots
}

export function kitAliases(root: string, extraRoots: string[] = []): Record<string, string> {
  const aliases: Record<string, string> = {
    '#kit': resolve(root, 'layers/core/kit'),
    '#registry': resolve(root, '.generated/registry.ts'),
    // Every policy section, collected by the build (scripts/lib/policies.ts).
    '#policies': resolve(root, '.generated/policies.ts'),
  }
  for (const dir of [...moduleRoots(root), ...extraRoots]) {
    const services = join(dir, 'server/services.ts')
    if (existsSync(services)) aliases[`#modules/${dir.split('/').pop()}`] = services
  }
  return aliases
}
