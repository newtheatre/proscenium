// Finds every module's list sources (server/lists/*.ts, each the default export of
// defineListSource), for the migration generator and the checks: the search indexes are made from
// their `search` fields (Foundations part 4, "Lists", S1).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, KIT } from './paths.ts'
import { jiti, type Loaded, type Owner } from './load.ts'
import { JOURNALS } from './write.ts'

export interface FoundSource { module: string, owner: Owner, file: string, source: any }

export async function findListSources(modules: Loaded[]): Promise<FoundSource[]> {
  const out: FoundSource[] = []
  for (const m of modules) {
    const dir = join(ROOT, m.found.root, 'server/lists')
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts')).sort()) {
      const file = `${m.found.root}/server/lists/${name}`
      const source = await jiti.import<any>(join(ROOT, file), { default: true })
      if (!source?.table?.name || !Array.isArray(source.search)) throw new Error(`${file}: the default export is not a list source made with defineListSource`)
      out.push({ module: m.manifest.id, owner: m.found.owner, file, source })
    }
  }
  return out
}

/** The indexes an owner's sources ask for: table to its searched columns. */
export async function wantedIndexes(sources: FoundSource[], owner: Owner): Promise<Map<string, string[]>> {
  const { searchedTables } = await jiti.import<any>(join(KIT, 'lists.ts'))
  return searchedTables(sources.filter(s => s.owner === owner).map(s => s.source))
}

/** The indexes an owner's journal has made so far, from the markers its migrations carry. */
export async function journalIndexes(owner: Owner): Promise<Map<string, string[] | null>> {
  const { searchIndexesInSql } = await jiti.import<any>(join(KIT, 'search.ts'))
  const dir = join(ROOT, JOURNALS[owner])
  if (!existsSync(dir)) return new Map()
  const sql = readdirSync(dir).sort().map(n => join(dir, n, 'migration.sql')).filter(existsSync).map(f => readFileSync(f, 'utf8')).join('\n')
  return searchIndexesInSql(sql)
}

/** What a new migration must do so the journal's indexes match the sources: make, remake or drop. */
export function indexChanges(wanted: Map<string, string[]>, made: Map<string, string[] | null>): { table: string, columns: string[] | null }[] {
  const out: { table: string, columns: string[] | null }[] = []
  for (const [table, columns] of wanted) {
    if (made.get(table)?.join(',') !== columns.join(',')) out.push({ table, columns })
  }
  for (const [table, columns] of made) if (columns && !wanted.has(table)) out.push({ table, columns: null })
  return out
}
