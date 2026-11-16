// Migrations: the schema and the migrations agree, append-only tables have their triggers, and a
// released migration is never edited, deleted, or followed by one that drops or renames.
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { ROOT } from '../lib/paths.ts'
import { JOURNALS } from '../lib/write.ts'
import { bundleSchema, drizzleKit } from '../lib/drizzle.ts'
import type { Loaded, Owner } from '../lib/load.ts'

const git = (...args: string[]) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  }
  catch {
    return ''
  }
}

export async function checkMigrations(modules: Loaded[], registry: any): Promise<string[]> {
  const problems: string[] = []
  for (const owner of ['upstream', 'site'] as Owner[]) {
    const journal = join(ROOT, JOURNALS[owner])
    const hasTables = modules.some(m => m.found.owner === owner && Object.keys(m.manifest.tables ?? {}).length)
    if (!hasTables) continue
    const scratch = mkdtempSync(join(tmpdir(), 'proscenium-check-'))
    try {
      if (existsSync(journal)) cpSync(journal, scratch, { recursive: true })
      const before = new Set(readdirSync(scratch))
      const schema = await bundleSchema(modules, owner)
      const run = drizzleKit(['generate', '--dialect', 'sqlite', '--schema', schema, '--out', scratch, '--name', 'check'])
      if (run.status !== 0) problems.push(`${JOURNALS[owner]}: drizzle-kit could not compare the schema: ${run.output.trim().split('\n').pop()}`)
      else if (readdirSync(scratch).some(n => !before.has(n))) problems.push(`${JOURNALS[owner]}: the tables declared in code differ from the migrations. Run bun run db:generate -- --name <what>${owner === 'site' ? ' --owner site' : ''}`)
    }
    finally {
      rmSync(scratch, { recursive: true, force: true })
    }
    const sql = existsSync(journal) ? readdirSync(journal).map(n => join(journal, n, 'migration.sql')).filter(existsSync).map(f => readFileSync(f, 'utf8')).join('\n') : ''
    for (const [name, { meta, module }] of registry.tables as Map<string, any>) {
      if (modules.find(m => m.manifest.id === module)?.found.owner !== owner || !meta.options.appendOnly) continue
      for (const trigger of [`${name}_append_only_update`, `${name}_append_only_delete`]) if (!sql.includes(`CREATE TRIGGER \`${trigger}\``)) problems.push(`${JOURNALS[owner]}: the append-only table ${name} has no ${trigger} trigger`)
    }
  }

  const release = git('describe', '--tags', '--abbrev=0', '--match', 'v*')
  if (release) {
    for (const line of git('diff', '--name-status', release, '--', 'migrations').split('\n').filter(Boolean)) {
      const [status, file] = line.split('\t') as [string, string]
      if (status !== 'A') problems.push(`${file}: was released in ${release} and must never change; write a new migration instead`)
      else if (/\b(DROP TABLE|DROP COLUMN|RENAME)\b/i.test(readFileSync(join(ROOT, file), 'utf8'))) problems.push(`${file}: drops or renames; within a major release migrations only add`)
    }
  }
  return problems
}
