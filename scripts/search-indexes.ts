// bun run search:drop | bun run search:make [--owner upstream|site]
// Writes the SQL that drops, or makes and fills, every search index the list sources ask for (S9).
// D1's standard export refuses a database with virtual tables, so before an export:
//   bun run search:drop > drop.sql && bunx wrangler d1 execute <database> --remote --file drop.sql
// and afterwards, on the old database and on the one imported into:
//   bun run search:make > make.sql && bunx wrangler d1 execute <database> --remote --file make.sql
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { loadRegistry, ROOTS, jiti, type Owner } from './lib/load.ts'
import { findListSources, wantedIndexes } from './lib/lists.ts'
import { KIT } from './lib/paths.ts'

const { values, positionals } = parseArgs({ args: Bun.argv.slice(2), options: { owner: { type: 'string', multiple: true } }, allowPositionals: true })
const action = positionals[0]
if (action !== 'drop' && action !== 'make') {
  console.error('Say drop or make: bun scripts/search-indexes.ts drop')
  process.exit(1)
}
const owners = (values.owner?.length ? values.owner : ['upstream', 'site']) as Owner[]
const { modules } = await loadRegistry(ROOTS)
const sources = await findListSources(modules)
const { searchIndexStatements, dropSearchIndexStatements } = await jiti.import<any>(join(KIT, 'search.ts'))
const out: string[] = []
for (const owner of owners) {
  for (const [table, columns] of await wantedIndexes(sources, owner)) {
    out.push(...(action === 'drop' ? dropSearchIndexStatements(table) : searchIndexStatements(table, columns)))
  }
}
process.stdout.write(out.length ? `${out.join('\n')}\n` : '-- No list is searched.\n')
