import { describe, expect, test } from 'bun:test'

// A signed-out visitor to a show-night screen is sent to sign in, as at the box office, rather
// than drawn the staff screen under "Your sign-in has ended" (E-112, review of 13 October 2026).
const SIGNS_IN = /middleware: '(signed-in|night-signed-in)'/
// The one screen a signed-out phone is drawn instead: the address and 999, nothing else (0237).
const OPEN_SIGNED_OUT = new Set(['emergency.vue'])

describe('every show-night screen sends a signed-out visitor to sign in', () => {
  test('each page under /tonight names a sign-in middleware', async () => {
    const missing: string[] = []
    for (const entry of new Bun.Glob('**/*.vue').scanSync({ cwd: 'app/pages/tonight', onlyFiles: true })) {
      const source = await Bun.file(`app/pages/tonight/${entry}`).text()
      if (!source.includes('definePageMeta') || OPEN_SIGNED_OUT.has(entry)) continue
      if (!SIGNS_IN.test(source)) missing.push(entry)
    }
    expect(missing).toEqual([])
  })

  test('the emergency card is open signed out and trims what it draws to the address', async () => {
    const source = await Bun.file('app/pages/tonight/emergency.vue').text()
    expect(SIGNS_IN.test(source)).toBe(false)
    expect(source).toContain('emergencyCardsFor(cache.shown.value, account.value.user?.id ?? null)')
  })

  test('no signal is not a sign-out: a session read that fails lets the screen draw', async () => {
    const source = await Bun.file('app/middleware/night-signed-in.ts').text()
    expect(source).toContain('catch')
    expect(source).toContain('/sign-in?next=')
  })
})
