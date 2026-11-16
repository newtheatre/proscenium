// Drives Drizzle Kit for one migration journal: bundles a schema entry for the owner's tables
// (resolving #kit), then runs `drizzle-kit generate` into the owner's folder.
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GENERATED, KIT, ROOT } from './paths.ts'
import { schemaSource } from './write.ts'
import type { Loaded, Owner } from './load.ts'

export async function bundleSchema(modules: Loaded[], owner: Owner): Promise<string> {
  const dir = join(GENERATED, 'schema')
  mkdirSync(dir, { recursive: true })
  const entry = join(dir, `${owner}.ts`)
  writeFileSync(entry, schemaSource(modules, owner))
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: dir,
    naming: `${owner}.[ext]`,
    target: 'node',
    format: 'esm',
    external: ['drizzle-orm', 'drizzle-orm/*', 'zod', 'h3', 'jiti'],
    plugins: [{
      name: 'kit-alias',
      setup(build) {
        build.onResolve({ filter: /^#kit(\/.*)?$/ }, args => ({ path: args.path === '#kit' ? join(KIT, 'index.ts') : join(KIT, `${args.path.slice(5)}.ts`) }))
      },
    }],
  })
  if (!result.success) throw new Error(result.logs.map(l => String(l)).join('\n'))
  return join(dir, `${owner}.js`)
}

export function drizzleKit(args: string[]): { status: number, output: string } {
  const run = spawnSync(join(ROOT, 'node_modules/.bin/drizzle-kit'), args, { cwd: ROOT, encoding: 'utf8' })
  return { status: run.status ?? 1, output: `${run.stdout ?? ''}${run.stderr ?? ''}` }
}
