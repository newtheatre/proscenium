import type { SessionFactor } from '#shared/utils/session-factor'

// The session carries identity only. Authority is resolved at request time from facts, never
// read back out of a cookie (0009), and the epoch is what makes revocation immediate (0007).
declare module '#auth-utils' {
  interface User {
    id: string
    name: string
    email: string
    epoch: number
  }

  interface UserSession {
    signedInAt: number
    // What proved this session, so a passkey's second factor stays this session's own and a
    // reassertion knows what "at least as strong" means (A-128 criteria 1 and 2).
    factor: SessionFactor
  }
}

export {}
