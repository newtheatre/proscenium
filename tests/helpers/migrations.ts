import { Database } from 'bun:sqlite'
import { applyMigration, applyMigrations, execMigration, migrationSql as sqlOfTag, migrationTags } from '#migration/schema'

// One harness for every test of a single migration's data step: the schema as it stood right
// before it, a seed in that shape, then that migration alone (0010, 0052).

export { execMigration }

// A whole tag, or its name with the number left off, so a test pinned by name survives renumbering.
export async function migrationTag(name: string): Promise<string> {
  const tag = (await migrationTags()).find(one => one.endsWith(name))
  if (!tag) throw new Error(`no migration ending ${name} is in the journal`)
  return tag
}

async function openBefore(tag: string): Promise<Database> {
  const raw = new Database(':memory:')
  try {
    raw.exec('PRAGMA foreign_keys = ON;')
    await applyMigrations(raw, tag)
    return raw
  }
  catch (thrown) {
    raw.close()
    throw thrown
  }
}

// An in-memory database, foreign keys on, holding every migration before the named one.
export async function databaseBefore(name: string): Promise<Database> {
  return openBefore(await migrationTag(name))
}

export async function applyTag(raw: Database, name: string): Promise<void> {
  await applyMigration(raw, await migrationTag(name))
}

// Read ahead of `execMigration`, for a test asserting the migration itself throws.
export async function migrationSql(name: string): Promise<string> {
  return sqlOfTag(await migrationTag(name))
}

// `runs` above one applies the migration again over its own result, which proves it idempotent.
export async function withMigration(
  name: string,
  seed: (raw: Database) => void,
  check: (raw: Database) => void,
  options: { runs?: number } = {},
): Promise<void> {
  const tag = await migrationTag(name)
  const raw = await openBefore(tag)
  try {
    seed(raw)
    for (let run = 0; run < (options.runs ?? 1); run++) await applyMigration(raw, tag)
    check(raw)
  }
  finally {
    raw.close()
  }
}
