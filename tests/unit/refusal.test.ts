import { describe, expect, test } from 'bun:test'
import { enrolPath, needsReauthentication, refusalText } from '../../app/utils/refusal'

// Issue 897: a role holding the permission but lacking a second factor must be told to enrol, not
// told it lacks the permission (server/utils/authorise.ts attaches data.enrol for that case).

// $fetch's own shape for an h3 createError: the response body lands whole on .data, and a
// route's own `data:` payload (createError's second-level data) nests one level further under it.
function refusal(statusMessage: string, data?: Record<string, unknown>): unknown {
  return { data: { statusMessage, data } }
}

describe('enrolPath', () => {
  test('reads the enrol path a second-factor refusal carries', () => {
    expect(enrolPath(refusal('needs an authenticator app', { enrol: '/account/security' }))).toBe('/account/security')
  })

  test('an ordinary refusal has none', () => {
    expect(enrolPath(refusal('Not found'))).toBeNull()
  })

  test('an error with no data at all has none', () => {
    expect(enrolPath(new Error('boom'))).toBeNull()
  })
})

describe('the enrol and reauthentication signals do not collide', () => {
  test('an enrol refusal is not read as a reauthentication one', () => {
    const error = refusal('needs an authenticator app', { enrol: '/account/security' })
    expect(enrolPath(error)).toBe('/account/security')
    expect(needsReauthentication(error)).toBe(false)
  })
})

describe('refusalText still prefers the route-written message alongside enrolPath', () => {
  test('both read from the same refusal', () => {
    const error = refusal('This role needs an authenticator app before it can be used', { enrol: '/account/security' })
    expect(refusalText(error)).toBe('This role needs an authenticator app before it can be used')
    expect(enrolPath(error)).toBe('/account/security')
  })
})
