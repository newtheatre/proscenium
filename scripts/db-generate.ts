// bun run db:generate -- --name <what> [--owner upstream|site|fixtures]
// Writes a migration from a schema change with Drizzle Kit, then adds the triggers the registry
// asks for: append-only tables refuse updates and deletes except erasure, and core_guard aborts a
// unit of work whose expectation fails. A migration that would rebuild an append-only table is
// refused, because a rebuild cannot keep the rows' history intact.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { loadRegistry, ROOTS, FIXTURES, LoadError, type Owner } from './lib/load.ts'
import { bundleSchema, drizzleKit } from './lib/drizzle.ts'
import { JOURNALS } from './lib/write.ts'
import { ROOT, KIT } from './lib/paths.ts'
import { jiti } from './lib/load.ts'

/** The unit of work's guard: a passing expectation is ignored, a failing one aborts the batch. */
export const GUARD_TRIGGER = "CREATE TRIGGER `core_guard_check` BEFORE INSERT ON `core_guard` BEGIN SELECT CASE WHEN NEW.ok = 1 THEN RAISE(IGNORE) ELSE RAISE(ABORT, 'guard:' || coalesce(NEW.code, '')) END; END;"

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { name: { type: 'string' }, owner: { type: 'string', default: 'upstream' } }, allowPositionals: true })
const owner = values.owner as Owner
if (!values.name || !/^[a-z0-9-]+$/.test(values.name)) {
  console.error('Give the migration a name: bun run db:generate -- --name add-orders')
  process.exit(1)
}
if (!(owner in JOURNALS)) {
  console.error('--owner is upstream, site or fixtures')
  process.exit(1)
}

try {
  const { modules, registry } = await loadRegistry(owner === 'fixtures' ? [...ROOTS, FIXTURES] : ROOTS)
  const out = join(ROOT, JOURNALS[owner])
  const before = new Set(existsSync(out) ? readdirSync(out) : [])
  const schema = await bundleSchema(modules, owner)
  const run = drizzleKit(['generate', '--dialect', 'sqlite', '--schema', schema, '--out', JOURNALS[owner], '--name', values.name])
  process.stdout.write(run.output)
  if (run.status !== 0) process.exit(run.status)
  const created = readdirSync(out).filter(name => !before.has(name))
  const { appendOnlyTriggers } = await jiti.import<any>(join(KIT, 'db.ts'))
  for (const folder of created) {
    const file = join(out, folder, 'migration.sql')
    let sql = readFileSync(file, 'utf8')
    const extra: string[] = []
    for (const [name, { meta, module }] of registry.tables as Map<string, any>) {
      if (modules.find((m: any) => m.manifest.id === module)?.found.owner !== owner) continue
      if (meta.options.appendOnly && new RegExp(`\`__new_${name}\``).test(sql)) {
        rmSync(join(out, folder), { recursive: true })
        console.error(`✗ This change would rebuild the append-only table ${name}, which cannot keep its history. Add a nullable column instead.`)
        process.exit(1)
      }
      const touched = new RegExp(`CREATE TABLE \`${name}\`|ALTER TABLE \`${name}\` ADD`).test(sql)
      if (meta.options.appendOnly && touched) {
        for (const trigger of appendOnlyTriggers(meta)) extra.push(`DROP TRIGGER IF EXISTS \`${trigger.name}\`;`, trigger.sql)
      }
      if (name === 'core_guard' && /CREATE TABLE `core_guard`/.test(sql)) extra.push(GUARD_TRIGGER)
    }
    if (extra.length) {
      sql = `${sql.trimEnd()}\n--> statement-breakpoint\n${extra.join('\n--> statement-breakpoint\n')}\n`
      writeFileSync(file, sql)
    }
    console.log(`Wrote ${JOURNALS[owner]}/${folder}/migration.sql${extra.length ? ` with ${extra.length} trigger statement${extra.length === 1 ? '' : 's'}` : ''}.`)
  }
}
catch (error) {
  if (error instanceof LoadError) {
    console.error(`✗ ${error.message}`)
    process.exit(1)
  }
  throw error
}
