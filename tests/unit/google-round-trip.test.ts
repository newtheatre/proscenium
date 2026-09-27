import { describe, expect, test } from 'bun:test'
import { googleRoundTripStart } from '#shared/utils/google-sign-in'

// A first leg of Google's round trip that asks for no next and no reassertion clears what an
// abandoned attempt left, or that attempt steers the next sign-in (A-128 criterion 4, 0094).

const source = (path: string): Promise<string> => Bun.file(path).text()

describe('the first leg of Google\'s round trip says what it asked for', () => {
  test('a local next and a reassertion are kept', () => {
    expect(googleRoundTripStart({ next: '/rooms/mine' })).toEqual({ next: '/rooms/mine', reauth: false })
    expect(googleRoundTripStart({ next: '/account', reauth: '1' })).toEqual({ next: '/account', reauth: true })
  })

  test('asking for nothing is an answer too: no next and no reassertion', () => {
    expect(googleRoundTripStart({})).toEqual({ next: null, reauth: false })
  })

  test('a next that leaves this site is no next at all', () => {
    expect(googleRoundTripStart({ next: '//evil.example/' })).toEqual({ next: null, reauth: false })
    expect(googleRoundTripStart({ next: '/\\evil.example' })).toEqual({ next: null, reauth: false })
  })

  test('Google\'s callback is not a first leg, answered or refused', () => {
    expect(googleRoundTripStart({ code: 'abc', state: 'xyz' })).toBeNull()
    expect(googleRoundTripStart({ error: 'access_denied' })).toBeNull()
  })
})

describe('the middleware clears what the first leg did not ask for', () => {
  test('both cookies are deleted when not asked, and the callback leaves them alone', async () => {
    const middleware = await source('server/middleware/google-return.ts')
    expect(middleware).toContain('const start = googleRoundTripStart(getQuery(event))')
    expect(middleware).toContain('if (!start) return')
    expect(middleware).toContain('deleteCookie(event, RETURN_COOKIE, { path: \'/\' })')
    expect(middleware).toContain('deleteCookie(event, REAUTH_COOKIE, { path: \'/\' })')
  })
})
