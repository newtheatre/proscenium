import { describe, expect, test } from 'bun:test'
import { nextField, wayInFor, withNext } from '#shared/utils/sign-in'

// The sign-in screen asks for the address first and offers what that address can use; every
// emailed link carries where the person set out from (0103).

describe('the address decides the way in (0103, 0008)', () => {
  test('a theatre address is offered Google alone', () => {
    expect(wayInFor('someone@newtheatre.org.uk')).toBe('google')
    expect(wayInFor('  Someone@NewTheatre.org.uk ')).toBe('google')
  })

  test('any other address is offered the emailed link and a password', () => {
    expect(wayInFor('member@example.org')).toBe('email')
    // A subdomain is not the Workspace domain: only the domain itself holds Google accounts.
    expect(wayInFor('member@e2e.newtheatre.org.uk')).toBe('email')
  })
})

describe('an emailed link carries next (0103)', () => {
  test('a path on this site is added to a link that already has a query', () => {
    expect(withNext('https://nnt.example/magic?token=abc', '/account/profile'))
      .toBe('https://nnt.example/magic?token=abc&next=%2Faccount%2Fprofile')
  })

  test('a link with no query gains one, and the path keeps its own query', () => {
    expect(withNext('/sign-in', '/book/p1?tickets=2')).toBe('/sign-in?next=%2Fbook%2Fp1%3Ftickets%3D2')
  })

  test('an explicit home page travels, since an explicit next always wins (0094)', () => {
    expect(withNext('/sign-in', '/')).toBe('/sign-in?next=%2F')
  })

  test('anything that is not a path on this site is left off, so no link is an open redirect', () => {
    for (const next of ['https://example.invalid/', '//example.invalid', '/\\example.invalid', 'account', 42, undefined, null]) {
      expect(withNext('/sign-in', next)).toBe('/sign-in')
    }
  })

  test('a next a route cannot use is dropped rather than refusing the request', () => {
    expect(nextField.parse('/my')).toBe('/my')
    expect(nextField.parse(undefined)).toBeUndefined()
    expect(nextField.parse(42)).toBeUndefined()
    expect(nextField.parse(`/${'x'.repeat(5000)}`)).toBeUndefined()
  })
})
