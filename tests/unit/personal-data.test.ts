import { describe, expect, test } from 'bun:test'

// Every table holding something about a person is classified, because the export and erasure both
// read that classification: a table nobody classified is one nobody exports and nobody erases.

const SCHEMA_DIR = 'server/db/schema'

async function schemaSource(): Promise<string> {
  const files = [...new Bun.Glob('*.ts').scanSync({ cwd: SCHEMA_DIR })]
  const parts = await Promise.all(files.map(file => Bun.file(`${SCHEMA_DIR}/${file}`).text()))
  return parts.join('\n')
}

const source = await schemaSource()

function tablesInSchema(): { name: string, personal: boolean }[] {
  const found: { name: string, personal: boolean }[] = []
  for (const block of source.split('export const ').slice(1)) {
    const name = block.match(/sqliteTable\('([a-z_]+)'/)?.[1]
    if (!name) continue
    // A person is named by a foreign key, or by a bare id column with no key at all: actor_id
    // and granted_by hold a user id and reference nothing.
    const namesAPerson = /users\.id/.test(block) || /'(user_id|actor_id|[a-z_]*_by)'/.test(block)
    found.push({ name, personal: name === 'users' || namesAPerson })
  }
  return found
}

const personalTablesInSchema = (): string[] =>
  tablesInSchema().filter(entry => entry.personal).map(entry => entry.name)

describe('the personal data registry (K-109, K-110)', () => {
  test('the schema is readable and has tables, so a broken parse cannot pass by finding none', () => {
    expect(personalTablesInSchema().length).toBeGreaterThan(5)
  })

  // The rule a new module has to satisfy: join the registry, or the build refuses it.
  test('every table naming a person is classified', async () => {
    const { PERSONAL_TABLES } = await import('#shared/utils/personal-data')
    const classified = new Set(PERSONAL_TABLES.map(entry => entry.name))
    expect(personalTablesInSchema().filter(name => !classified.has(name))).toEqual([])
  })

  test('nothing is classified that the schema does not have', async () => {
    const { PERSONAL_TABLES } = await import('#shared/utils/personal-data')
    const inSchema = new Set(tablesInSchema().map(entry => entry.name))
    expect(PERSONAL_TABLES.map(entry => entry.name).filter(name => !inSchema.has(name))).toEqual([])
  })

  test('a scrub says what it writes, and nothing else does', async () => {
    const { PERSONAL_TABLES } = await import('#shared/utils/personal-data')
    for (const entry of PERSONAL_TABLES) {
      const wanted = entry.erasure === 'scrub' && entry.name !== 'users'
      expect(`${entry.name}: ${Boolean(entry.scrub)}`).toBe(`${entry.name}: ${wanted}`)
    }
  })

  test('an exported table names its section and its columns, and an unexported one names neither', async () => {
    const { PERSONAL_TABLES } = await import('#shared/utils/personal-data')
    for (const entry of PERSONAL_TABLES) {
      expect(`${entry.name}: ${Boolean(entry.section) === Boolean(entry.columns)}`).toBe(`${entry.name}: true`)
    }
  })

  test('every entry says why, because the next person has to be able to disagree with it', async () => {
    const { PERSONAL_TABLES } = await import('#shared/utils/personal-data')
    for (const entry of PERSONAL_TABLES) {
      expect(`${entry.name}: ${entry.why.length > 20}`).toBe(`${entry.name}: true`)
    }
  })
})
