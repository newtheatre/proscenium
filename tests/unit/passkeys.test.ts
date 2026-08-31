import { describe, expect, test } from 'bun:test'
import {
  PASSKEY_CHALLENGE_TTL_SECONDS,
  authenticationOptions,
  refusalForCounter,
  refusalForVerification,
  registrationOptions,
} from '#shared/utils/passkeys'

// A-105. The library hardcodes requireUserVerification: false on both ceremonies, so the rules the
// story asks for are enforced here and asserted here.

describe('a passkey is usernameless and proves the person (criteria 1 and 3)', () => {
  test('registration asks for a discoverable credential', () => {
    expect(registrationOptions().authenticatorSelection?.residentKey).toBe('required')
  })

  test('both ceremonies require user verification, not merely prefer it', () => {
    expect(registrationOptions().authenticatorSelection?.userVerification).toBe('required')
    expect(authenticationOptions().userVerification).toBe('required')
  })

  test('signing in offers no credential list, because it does not know who is asking', () => {
    expect(authenticationOptions().allowCredentials).toEqual([])
  })

  test('an authenticator that did not verify the person is refused, on either ceremony', () => {
    expect(refusalForVerification(false)).toBeTruthy()
    expect(refusalForVerification(true)).toBeNull()
  })

  test('the refusal says what to do, because a device PIN is a setting somebody can turn on', () => {
    expect(refusalForVerification(false)).toContain('PIN')
  })
})

// Criterion 4: the counter is recorded on every use, which is only worth doing if a counter that
// goes backwards is treated as the cloned authenticator it indicates.
describe('the signature counter is watched, not just stored', () => {
  test('a counter that advances is accepted', () => {
    expect(refusalForCounter(4, 5)).toBeNull()
  })

  test('a counter that repeats or goes backwards is refused', () => {
    expect(refusalForCounter(5, 5)).toBeTruthy()
    expect(refusalForCounter(5, 4)).toBeTruthy()
  })

  test('an authenticator that keeps no counter stays at zero and is not accused', () => {
    expect(refusalForCounter(0, 0)).toBeNull()
  })
})

describe('a challenge does not wait around', () => {
  test('it lives minutes, not hours', () => {
    expect(PASSKEY_CHALLENGE_TTL_SECONDS).toBeGreaterThan(60)
    expect(PASSKEY_CHALLENGE_TTL_SECONDS).toBeLessThanOrEqual(10 * 60)
  })
})
