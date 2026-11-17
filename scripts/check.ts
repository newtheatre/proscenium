// bun run check:conformance — the conformance checks of the Foundations test plan (F-10). Each
// prints what it found, naming the file and what to do; any problem fails the run.
import { loadRegistry, LoadError } from './lib/load.ts'
import { checkPageAddresses, checkRoutes } from './checks/routes.ts'
import { checkMigrations } from './checks/migrations.ts'
import { checkAbilities, checkAccountComparisons, checkChangeCounts, checkContentTokens, checkEventsAndJobs, checkImports, checkNavigation, checkPolicyNumbers, checkSealSpecial, checkTranslations } from './checks/source.ts'
import { checkSite } from './checks/site.ts'
import { checkInterface } from './checks/interface.ts'

let failed = 0
function report(name: string, problems: string[]) {
  console.log(`${problems.length ? '✗' : '✓'} ${name}`)
  for (const p of problems) console.log(`    ${p}`)
  failed += problems.length
}

let loaded: Awaited<ReturnType<typeof loadRegistry>>
try {
  loaded = await loadRegistry()
  report('Manifests, tables and data classes', [])
}
catch (error) {
  if (!(error instanceof LoadError)) throw error
  report('Manifests, tables and data classes', [error.message])
  process.exit(1)
}
const { modules, registry } = loaded

report('Routes', checkRoutes(registry, modules))
report('Reserved addresses', checkPageAddresses())
report('Abilities', checkAbilities(modules, registry))
report('Settings quoted in content', checkContentTokens(registry))
report('The site\'s menu and page components', checkSite(registry, source => Bun.YAML.parse(source)))
report('Events and jobs', checkEventsAndJobs(modules, registry))
report('Imports, bindings and outside calls', checkImports(modules))
report('Numbers that should be settings', checkPolicyNumbers(modules))
report('Reads by account go through the account scope', checkAccountComparisons(modules, registry))
report('sealSpecial and sealColumn write encrypted columns, never a token', checkSealSpecial(modules, registry))
report('Counts of changed rows are tested against nought, and SQL never reads changes()', checkChangeCounts(modules))
report('Translations', checkTranslations(modules, registry))
report('Navigation coverage', checkNavigation(modules, registry))
report('Screens are built from the kit', checkInterface(modules))
report('Migrations', await checkMigrations(modules, registry))

console.log('\nNot yet checked (they need modules that do not exist yet): the erasure scan, soft-dependency switching, and owned paths (fork CI only: bun run check:paths).')
console.log(failed ? `\n${failed} problem${failed === 1 ? '' : 's'} found.` : '\nEverything conforms.')
process.exit(failed ? 1 : 0)
