import { describe, expect, test } from 'bun:test'
import { enrolPath, needsReauthentication, refusalText, writeFailureText } from '../../app/utils/refusal'

// $fetch's own shape for an h3 createError: the response body lands whole on .data, and a
// route's own `data:` payload (createError's second-level data) nests one level further under it.
function refusal(statusMessage: string, data?: Record<string, unknown>): unknown {
  return { data: { statusMessage, data } }
}

// What `server/utils/validation.ts` now sends instead of a list of field keys (K-128 criterion 2).
const HOUSE_REFUSAL = 'Something on this form needs another look'

describe('refusalText prefers a field message (issue 913)', () => {
  test('a single field failure is shown by its own message, not the generic sentence', () => {
    const error = refusal(HOUSE_REFUSAL, { fields: { 'guest.email': 'Enter a real email address' } })
    expect(refusalText(error)).toBe('Enter a real email address')
  })

  test('the first field wins when more than one failed', () => {
    const error = refusal(HOUSE_REFUSAL, {
      fields: { name: 'Enter your name', email: 'Enter a real email address' },
    })
    expect(refusalText(error)).toBe('Enter your name')
  })

  test('a refusal with no fields falls back to the statusMessage as before', () => {
    const error = refusal('That booking is not waiting for a decision')
    expect(refusalText(error)).toBe('That booking is not waiting for a decision')
  })

  test('a refusal with an empty fields map falls back to the statusMessage', () => {
    const error = refusal(HOUSE_REFUSAL, { fields: {} })
    expect(refusalText(error)).toBe(HOUSE_REFUSAL)
  })
})

// Issue 897: a role holding the permission but lacking a second factor must be told to enrol, not
// told it lacks the permission (server/utils/authorise.ts attaches data.enrol for that case).
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

// K-103 protects reads, not writes: a network drop mid-write needs its own words, not the
// generic "did not work" fallback.
describe('writeFailureText tells a transport failure apart from an ordinary refusal', () => {
  test('an ordinary refusal, with a statusCode, reads as normal', () => {
    const error = { statusCode: 409, data: { statusMessage: 'The total has changed: £5.00 now, was £4.50' } }
    expect(writeFailureText(error, 'Check the last sale.')).toBe('The total has changed: £5.00 now, was £4.50')
  })

  test('a transport failure, no statusCode at all, says the write may or may not have landed', () => {
    const error = new TypeError('Failed to fetch')
    expect(writeFailureText(error, 'Check the last sale before ringing it up again.'))
      .toBe('The connection dropped, so it may or may not have gone through. Check the last sale before ringing it up again.')
  })
})
