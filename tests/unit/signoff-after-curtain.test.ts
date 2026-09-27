import { describe, expect, test } from 'bun:test'
import { signOffTooEarly } from '#shared/utils/night-signoff'

// Issue 1315 hid Sign off and close until the curtain is down; the route now refuses it too,
// naming when it opens, since hiding a control is never the enforcement (E-111 criterion 5).

const CURTAIN_DOWN = 1793916600

describe('the sign-off opens once the curtain is down (issue 1315, E-124)', () => {
  test('before the curtain it is refused, naming when it opens', () => {
    expect(signOffTooEarly(CURTAIN_DOWN, CURTAIN_DOWN - 1)).toBe('Sign off and close opens at 22:10, once the curtain is down.')
  })

  test('from the moment the curtain is down it is not', () => {
    expect(signOffTooEarly(CURTAIN_DOWN, CURTAIN_DOWN)).toBeNull()
    expect(signOffTooEarly(CURTAIN_DOWN, CURTAIN_DOWN + 3600)).toBeNull()
  })

  test('a performance with no times to reckon from is not held, as the screen does not hold it', () => {
    expect(signOffTooEarly(null, CURTAIN_DOWN)).toBeNull()
  })
})

describe('the route and the screen read the same curtain', () => {
  test('the sign-off route refuses before it compiles or writes anything', async () => {
    const route = await Bun.file('server/api/tonight/report/sign-off.post.ts').text()
    expect(route).toContain('signOffTooEarly(times ? performanceEnd(times) : null, Math.floor(Date.now() / 1000))')
    expect(route.indexOf('signOffTooEarly(')).toBeLessThan(route.indexOf('compileNightReport('))
    expect(await Bun.file('server/api/tonight/report.get.ts').text()).toContain('performanceEnd(times)')
  })
})
