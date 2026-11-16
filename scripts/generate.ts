// bun run generate: loads every module, checks each manifest and the registry across modules,
// checks every route declares its permission, and writes .generated/. Runs before dev and build,
// so a manifest error or an undeclared route fails the build with the file and field named.
import { readFileSync, writeFileSync } from 'node:fs'
import { loadRegistry, LoadError } from './lib/load.ts'
import { writeGenerated } from './lib/write.ts'
import { checkRoutes } from './checks/routes.ts'
import { publicComponentProblems, publicComponents } from './checks/site.ts'
import { abs } from './lib/paths.ts'

const version = JSON.parse(readFileSync(abs('package.json'), 'utf8')).version as string

try {
  const { modules, registry } = await loadRegistry()
  const components = publicComponents(registry)
  const problems = [...checkRoutes(registry, modules, { fatalOnly: true }), ...publicComponentProblems(components)]
  if (problems.length) {
    for (const p of problems) console.error(`✗ ${p}`)
    process.exit(1)
  }
  writeGenerated(modules, { version })
  // The core layer reads this to register each public component under its alias (see its nuxt.config).
  writeFileSync(abs('.generated/public-components.json'), `${JSON.stringify(components.filter(c => c.alias), null, 2)}\n`)
  console.log(`Registry: ${modules.length} module${modules.length === 1 ? '' : 's'} (${modules.map(m => m.manifest.id).join(', ')}).`)
}
catch (error) {
  if (error instanceof LoadError) {
    console.error(`✗ ${error.message}`)
    process.exit(1)
  }
  throw error
}
