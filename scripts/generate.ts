// bun run generate: loads every module, checks each manifest and the registry across modules,
// checks every route declares its permission, and writes .generated/. Runs before dev and build,
// so a manifest error or an undeclared route fails the build with the file and field named.
import { readFileSync } from 'node:fs'
import { loadRegistry, LoadError } from './lib/load.ts'
import { writeGenerated } from './lib/write.ts'
import { checkRoutes } from './checks/routes.ts'
import { abs } from './lib/paths.ts'

const version = JSON.parse(readFileSync(abs('package.json'), 'utf8')).version as string

try {
  const { modules, registry } = await loadRegistry()
  const problems = checkRoutes(registry, modules, { fatalOnly: true })
  if (problems.length) {
    for (const p of problems) console.error(`✗ ${p}`)
    process.exit(1)
  }
  writeGenerated(modules, { version })
  console.log(`Registry: ${modules.length} module${modules.length === 1 ? '' : 's'} (${modules.map(m => m.manifest.id).join(', ')}).`)
}
catch (error) {
  if (error instanceof LoadError) {
    console.error(`✗ ${error.message}`)
    process.exit(1)
  }
  throw error
}
