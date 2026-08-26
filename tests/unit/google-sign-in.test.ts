import { describe, expect, test } from 'bun:test'
import { resolveGoogleSignIn } from '#shared/utils/google-sign-in'
import type { CandidateAccount, GoogleIdentity, GoogleLookups } from '#shared/utils/google-sign-in'

const identity: GoogleIdentity = {
  email: 'officer@newtheatre.org.uk',
  emailVerified: true,
  hostedDomain: 'newtheatre.org.uk',
  sub: 'google-sub-1',
}
const none: GoogleLookups = { bySub: null, byPendingEmail: null, byEmail: null }
const account = (over: Partial<CandidateAccount> = {}): CandidateAccount =>
  ({ id: 'u-1', googleSub: null, disabled: false, anonymisedAt: null, ...over })

describe('who may sign in with Google (A-104, 0008)', () => {
  test('a personal Google account is refused, whatever the hosted domain hint said', () => {
    expect(resolveGoogleSignIn({ ...identity, email: 'someone@gmail.com', hostedDomain: null }, none))
      .toEqual({ action: 'refuse', reason: 'not-workspace' })
    // The hint claims our domain; the address does not. The address decides.
    expect(resolveGoogleSignIn({ ...identity, email: 'someone@gmail.com' }, none))
      .toEqual({ action: 'refuse', reason: 'not-workspace' })
  })

  test('a hosted domain that is not ours is refused', () => {
    expect(resolveGoogleSignIn({ ...identity, hostedDomain: 'example.com' }, none))
      .toEqual({ action: 'refuse', reason: 'not-workspace' })
  })

  test('an unverified address is refused', () => {
    expect(resolveGoogleSignIn({ ...identity, emailVerified: false }, none))
      .toEqual({ action: 'refuse', reason: 'unverified-email' })
  })
})

describe('resolution order (A-104 criterion 2)', () => {
  test('an existing Google link wins', () => {
    const lookups = { ...none, bySub: account({ id: 'u-sub', googleSub: identity.sub }), byEmail: account({ id: 'u-email' }) }
    expect(resolveGoogleSignIn(identity, lookups)).toEqual({ action: 'sign-in', userId: 'u-sub' })
  })

  test('then an admin-set pending link', () => {
    const lookups = { ...none, byPendingEmail: account({ id: 'u-pending' }), byEmail: account({ id: 'u-email' }) }
    expect(resolveGoogleSignIn(identity, lookups)).toEqual({ action: 'claim-pending', userId: 'u-pending' })
  })

  test('then a matching address', () => {
    expect(resolveGoogleSignIn(identity, { ...none, byEmail: account({ id: 'u-email' }) }))
      .toEqual({ action: 'claim-by-email', userId: 'u-email' })
  })

  test('and otherwise a new account', () => {
    expect(resolveGoogleSignIn(identity, none)).toEqual({ action: 'create' })
  })
})

describe('nothing is written where it should not be (A-104 criteria 3 and 4)', () => {
  test('a disabled or anonymised account is never signed into or claimed', () => {
    for (const over of [{ disabled: true }, { anonymisedAt: 1 }]) {
      expect(resolveGoogleSignIn(identity, { ...none, bySub: account({ googleSub: identity.sub, ...over }) }))
        .toEqual({ action: 'refuse', reason: 'disabled' })
      expect(resolveGoogleSignIn(identity, { ...none, byEmail: account(over) }))
        .toEqual({ action: 'refuse', reason: 'disabled' })
    }
  })

  test('an account already linked to another Google identity is a merge, not a re-link', () => {
    expect(resolveGoogleSignIn(identity, { ...none, byEmail: account({ googleSub: 'someone-elses-sub' }) }))
      .toEqual({ action: 'refuse', reason: 'linked-elsewhere' })
    expect(resolveGoogleSignIn(identity, { ...none, byPendingEmail: account({ googleSub: 'someone-elses-sub' }) }))
      .toEqual({ action: 'refuse', reason: 'linked-elsewhere' })
  })
})
