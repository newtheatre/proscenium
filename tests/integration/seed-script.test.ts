import { describe, expect, test } from 'bun:test'

// K-120 criterion 2, which asks for this test by name. The helpers have their own; this proves the
// script calls them, and refuses with a non-zero exit rather than a warning.

function run(args: string[], env: Record<string, string> = {}): { code: number, said: string } {
  const ran = Bun.spawnSync(['bun', 'scripts/seed.ts', ...args], {
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return { code: ran.exitCode, said: `${ran.stdout.toString()}${ran.stderr.toString()}` }
}

describe('the seed script refuses what it must', () => {
  test('it refuses to run in production at all', () => {
    const { code, said } = run(['.data/db/sqlite.db'], { NODE_ENV: 'production' })
    expect(code).not.toBe(0)
    expect(said.toLowerCase()).toContain('production')
  })

  test('it refuses a database that is not local', () => {
    for (const target of ['unified', '/var/lib/production.db', 'https://d1.cloudflare.com/x']) {
      expect(`${target}: ${run([target]).code === 0}`).toBe(`${target}: false`)
    }
  })

  test('it refuses anything naming the society, whatever the path looks like', () => {
    expect(run(['/tmp/newtheatre.org.uk.db']).code).not.toBe(0)
    expect(run(['/tmp/something.workers.dev.db']).code).not.toBe(0)
  })

  // The refusal has to say why, or somebody will assume the command is broken and reach for a flag.
  test('the refusal states itself rather than failing silently', () => {
    const { said } = run(['unified'])
    expect(said.length).toBeGreaterThan(20)
  })
})
