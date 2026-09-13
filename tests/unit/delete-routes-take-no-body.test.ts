import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

// A DELETE that carries a body hangs the Workers runtime when the handler reads it (0068), so the
// rule is a test rather than a review habit: parameters go in the path or the query string.

const ROUTES = 'server/api'
const READS_A_BODY = /readValidatedBodyOrThrow|readBody\s*\(/

async function deleteRoutes(): Promise<{ path: string, source: string }[]> {
  const found: { path: string, source: string }[] = []
  for (const entry of new Bun.Glob('**/*.delete.ts').scanSync({ cwd: ROUTES, onlyFiles: true })) {
    const path = join(ROUTES, entry).replaceAll('\\', '/')
    found.push({ path, source: await Bun.file(path).text() })
  }
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

describe('a DELETE route reads no request body (0068)', () => {
  test('every *.delete.ts handler takes its parameters from the path or the query', async () => {
    const routes = await deleteRoutes()
    expect(routes.length).toBeGreaterThan(0)

    const offenders = routes.filter(route => READS_A_BODY.test(route.source)).map(route => route.path)
    expect(offenders).toEqual([])
  })

  test('no client sends a body with a DELETE', async () => {
    const offenders: string[] = []
    for (const directory of ['app', 'server']) {
      for (const entry of new Bun.Glob('**/*.{vue,ts}').scanSync({ cwd: directory, onlyFiles: true })) {
        const path = join(directory, entry).replaceAll('\\', '/')
        const source = await Bun.file(path).text()
        // One call, one line: a DELETE naming a body on the same statement is the shape that breaks.
        if (/method:\s*['"`]DELETE['"`][^\n]*\bbody:/.test(source)) offenders.push(path)
      }
    }
    expect(offenders).toEqual([])
  })
})
