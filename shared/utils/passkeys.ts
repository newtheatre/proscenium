import type { AuthenticatorSelectionCriteria } from '@simplewebauthn/server'

// The rules nuxt-auth-utils does not enforce: both its ceremonies verify with
// requireUserVerification: false, so a passkey standing in for two steps is checked here (A-105).

export const PASSKEY_CHALLENGE_TTL_SECONDS = 5 * 60

export interface RegistrationShape {
  authenticatorSelection: AuthenticatorSelectionCriteria
}

// A discoverable credential, because sign-in offers no username to look one up by.
export function registrationOptions(): RegistrationShape {
  return {
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
    },
  }
}

export interface AuthenticationShape {
  userVerification: AuthenticatorSelectionCriteria['userVerification']
  // Empty on purpose: naming credentials would both leak who holds one and defeat usernameless.
  allowCredentials: never[]
}

export function authenticationOptions(): AuthenticationShape {
  return { userVerification: 'required', allowCredentials: [] }
}

export function refusalForVerification(userVerified: boolean): string | null {
  return userVerified
    ? null
    : 'That device did not check it was you. Turn on a device PIN or biometric and try again.'
}

// A counter that does not advance is the signature of a cloned authenticator, which is the whole
// reason the count is kept. Zero on both sides means the authenticator keeps no counter at all.
export function refusalForCounter(stored: number, next: number): string | null {
  if (stored === 0 && next === 0) return null
  return next > stored ? null : 'That passkey looks copied: its use count did not advance.'
}
