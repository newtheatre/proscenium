#!/usr/bin/env bun
// Turns out/target.sqlite into plain INSERT files under out/publish/, parents before children,
// so reset-production.sh can execute them against D1 in order (0072). Writes nothing remote.
import { Database } from 'bun:sqlite'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertNotProduction } from '../tests/helpers/seed'
import { OUT, tables, writeJson } from './lib'
import { createTarget } from './schema'

export const PUBLISH_DIR = join(OUT, 'publish')
const STATEMENTS_PER_FILE = 20_000

function literal(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value)
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString('hex')}'`
  return `'${String(value).replaceAll('\'', '\'\'')}'`
}

// Parents first: a child's foreign key must find its row even where D1 does not defer the check.
export function orderTables(db: Database, names: readonly string[]): string[] {
  const parents = new Map<string, Set<string>>()
  for (const name of names) {
    const refs = db.query<{ table: string }, []>(`PRAGMA foreign_key_list("${name}")`).all().map(row => row.table)
    parents.set(name, new Set(refs.filter(ref => ref !== name && names.includes(ref))))
  }
  const ordered: string[] = []
  const placed = new Set<string>()
  while (ordered.length < names.length) {
    const ready = names.filter(name => !placed.has(name) && [...parents.get(name)!].every(parent => placed.has(parent)))
    // A cycle (two tables referencing each other) is broken by taking the first waiting table.
    const next = ready.length ? ready : [names.find(name => !placed.has(name))!]
    for (const name of next.sort()) {
      ordered.push(name)
      placed.add(name)
    }
  }
  return ordered
}

export interface DumpOptions {
  // The ledger is written by nuxt-db migrate on the target already; leave it out when so told.
  skipLedger: boolean
  // A freshly migrated, empty database: rows the migrations themselves seed are already on the
  // remote once nuxt-db has run, so a row matching one by primary key is left out here.
  seeded?: Database
}

// The primary key and every unique index: a row the migrations seed may carry a different id on
// each database (minted at migration time), so it is recognised by any key that must be unique.
function uniqueKeys(db: Database, table: string): string[][] {
  const keys: string[][] = []
  const pk = db.query<{ name: string, pk: number }, []>(`PRAGMA table_info("${table}")`).all()
    .filter(column => column.pk > 0).sort((a, b) => a.pk - b.pk).map(column => column.name)
  if (pk.length) keys.push(pk)
  for (const index of db.query<{ name: string, unique: number }, []>(`PRAGMA index_list("${table}")`).all()) {
    if (!index.unique) continue
    const columns = db.query<{ name: string | null }, []>(`PRAGMA index_info("${index.name}")`).all().map(column => column.name)
    if (columns.every(Boolean)) keys.push(columns as string[])
  }
  return keys
}

export function dumpData(db: Database, dir: string, options: DumpOptions): { files: string[], statements: number, counts: Record<string, number>, seededSkipped: Record<string, number> } {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })

  const all = tables(db).filter(name => !name.startsWith('_content'))
  const names = orderTables(db, all)
  if (!options.skipLedger) names.unshift('_hub_migrations')

  const files: string[] = []
  const counts: Record<string, number> = {}
  const seededSkipped: Record<string, number> = {}
  let statements = 0
  let batch: string[] = []
  const flush = () => {
    if (!batch.length) return
    const file = `${String(files.length + 1).padStart(3, '0')}-data.sql`
    writeFileSync(join(dir, file), ['PRAGMA defer_foreign_keys = true;', ...batch, ''].join('\n'))
    files.push(file)
    batch = []
  }

  for (const name of names) {
    const columns = db.query<{ name: string }, []>(`PRAGMA table_info("${name}")`).all().map(row => row.name)
    const rows = db.query<Record<string, unknown>, []>(`SELECT * FROM "${name}"`).all()
    counts[name] = rows.length
    if (!rows.length) continue
    const keys = uniqueKeys(db, name)
    const seeded = new Set<string>()
    if (options.seeded && options.seeded.query<{ n: number }, []>(`SELECT count(*) AS n FROM sqlite_master WHERE name = '${name}'`).get()!.n) {
      for (const row of options.seeded.query<Record<string, unknown>, []>(`SELECT * FROM "${name}"`).all()) {
        for (const key of keys) seeded.add(JSON.stringify([key, key.map(column => row[column])]))
      }
    }
    batch.push(`-- ${name}: ${rows.length}`)
    for (const row of rows) {
      if (keys.some(key => seeded.has(JSON.stringify([key, key.map(column => row[column])])))) {
        seededSkipped[name] = (seededSkipped[name] ?? 0) + 1
        continue
      }
      batch.push(`INSERT INTO "${name}" (${columns.map(column => `"${column}"`).join(', ')}) VALUES (${columns.map(column => literal(row[column])).join(', ')});`)
      statements++
      if (batch.length >= STATEMENTS_PER_FILE) flush()
    }
  }
  flush()
  return { files, statements, counts, seededSkipped }
}

if (import.meta.main) {
  assertNotProduction()
  const skipLedger = process.argv.includes('--skip-ledger')
  const targetPath = process.argv.slice(2).find(argument => !argument.startsWith('-')) ?? join(OUT, 'target.sqlite')
  const db = new Database(targetPath, { readonly: true })
  const seeded = await createTarget(':memory:')
  const { files, statements, counts, seededSkipped } = dumpData(db, PUBLISH_DIR, { skipLedger, seeded })
  seeded.close()
  db.close()
  await writeJson('publish/counts.json', counts)
  console.log(`Wrote ${statements} statements over ${files.length} file(s) to ${PUBLISH_DIR}${skipLedger ? ' (ledger left to nuxt-db)' : ''}.`)
  for (const [table, n] of Object.entries(seededSkipped)) console.log(`  ${n} row(s) of ${table} left to the migrations that seed them`)
  console.log(readdirSync(PUBLISH_DIR).join(', '))
}
