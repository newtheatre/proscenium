import { describe, expect, test } from 'bun:test'
import { isFresh } from '#shared/utils/freshness'
import { reauthOptions } from '#shared/utils/reauthentication'
import { satisfiesSecondFactor } from '#shared/utils/session-factor'
import type { ReauthAccountState } from '#shared/utils/reauthentication'

// A-128: the session records which factor proved it, session-scoped rather than account-scoped,
// and a modal re-asserts at least as strong a factor as the one that opened the session.

describe('which factors satisfy a second factor on their own (criteria 1 and 2)', () => {
  test('a passkey and a Workspace sign-in each prove two things in one step', () => {
    expect(satisfiesSecondFactor('passkey')).toBe(true)
    expect(satisfiesSecondFactor('google')).toBe(true)
  })

  test('a code answered against a password step is the second factor itself', () => {
    expect(satisfiesSecondFactor('totp')).toBe(true)
    expect(satisfiesSecondFactor('recovery-code')).toBe(true)
  })

  test('a bare password or a mailbox link proves one thing and needs its own second factor', () => {
    expect(satisfiesSecondFactor('password')).toBe(false)
    expect(satisfiesSecondFactor('magic-link')).toBe(false)
  })
})

const state = (partial: Partial<ReauthAccountState>): ReauthAccountState => ({
  factor: 'password',
  hasPassword: true,
  hasConfirmedTotp: false,
  hasPasskey: false,
  ...partial,
})

describe('what the re-authentication modal may accept (criterion 3)', () => {
  test('a passkey session satisfies the factor by re-asserting the passkey, and nothing else', () => {
    const options = reauthOptions(state({ factor: 'passkey', hasPassword: false, hasPasskey: true }))
    expect(options).toEqual([{ kind: 'passkey' }])
  })

  // Criterion 2: registering a passkey elsewhere on the account does not change what a password
  // session may be asked to reassert with. The session, not the account, decides.
  test('a password session on a passkey-owning account does not inherit the passkey', () => {
    const options = reauthOptions(state({ factor: 'password', hasPassword: true, hasPasskey: true }))
    expect(options).toEqual([{ kind: 'password', secondFactor: false }])
  })

  test('a password session on an account with a confirmed authenticator asks for both', () => {
    const options = reauthOptions(state({ factor: 'totp', hasPassword: true, hasConfirmedTotp: true }))
    expect(options).toEqual([{ kind: 'password', secondFactor: true }])
  })

  // Criterion 4: 0008 forbids a Workspace account ever holding a password, so a password field is
  // never one of its options, whatever it currently holds.
  test('a Workspace account is offered no password field, with or without a passkey', () => {
    const noPasskey = reauthOptions(state({ factor: 'google', hasPassword: false, hasPasskey: false }))
    expect(noPasskey).toEqual([{ kind: 'google' }])
    expect(noPasskey.some(option => option.kind === 'password')).toBe(false)

    const withPasskey = reauthOptions(state({ factor: 'google', hasPassword: false, hasPasskey: true }))
    expect(withPasskey).toEqual([{ kind: 'google' }, { kind: 'passkey' }])
    expect(withPasskey.some(option => option.kind === 'password')).toBe(false)
  })

  test('a password-less, non-Workspace session with no passkey has nothing to offer', () => {
    const options = reauthOptions(state({ factor: 'magic-link', hasPassword: false, hasPasskey: false }))
    expect(options).toEqual([])
  })
})

describe('a stale confirmation is refused (criterion 5)', () => {
  test('inside the window it is fresh', () => {
    expect(isFresh(1_000, 10, 1_000 + 9 * 60)).toBe(true)
    expect(isFresh(1_000, 10, 1_000 + 10 * 60)).toBe(true)
  })

  test('a moment past the window it is stale', () => {
    expect(isFresh(1_000, 10, 1_000 + 10 * 60 + 1)).toBe(false)
  })

  test('an hour-old confirmation does not authorise a ten-minute window', () => {
    expect(isFresh(1_000, 10, 1_000 + 60 * 60)).toBe(false)
  })
})
