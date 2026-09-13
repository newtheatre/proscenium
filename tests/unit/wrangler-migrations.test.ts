import { describe, expect, test } from 'bun:test'

describe('the built worker migration path', () => {
  test('is relative to .output/server/wrangler.json', async () => {
    const source = await Bun.file('nuxt.config.ts').text()
    expect(source).toContain('migrations_dir: \'db/migrations/sqlite\'')
    expect(source).not.toContain('migrations_dir: \'server/db/migrations/sqlite\'')

    const generated = Bun.file('.output/server/wrangler.json')
    if (!await generated.exists()) return

    const config = await generated.json() as {
      d1_databases?: { binding: string, migrations_dir?: string }[]
    }
    expect(config.d1_databases?.find(db => db.binding === 'DB')?.migrations_dir)
      .toBe('db/migrations/sqlite')
  })
})
