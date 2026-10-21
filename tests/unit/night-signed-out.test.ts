import { describe, expect, test } from 'bun:test'

// A signed-out visitor to a show-night screen is sent to sign in, as at the box office, rather
// than drawn the staff screen under "Your sign-in has ended" (E-112, review of 13 October 2026).
const SIGNS_IN = /middleware: '(signed-in|night-signed-in)'/

describe('every show-night screen sends a signed-out visitor to sign in', () => {
  test('each page under /tonight names a sign-in middleware', async () => {
    const missing: string[] = []
    for (const entry of new Bun.Glob('**/*.vue').scanSync({ cwd: 'app/pages/tonight', onlyFiles: true })) {
      const source = await Bun.file(`app/pages/tonight/${entry}`).text()
      if (!source.includes('definePageMeta')) continue
      if (!SIGNS_IN.test(source)) missing.push(entry)
    }
    expect(missing).toEqual([])
  })

  test('no signal is not a sign-out: a session read that fails lets the screen draw', async () => {
    const source = await Bun.file('app/middleware/night-signed-in.ts').text()
    expect(source).toContain('catch')
    expect(source).toContain('/sign-in?next=')
  })
})
