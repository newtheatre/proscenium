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
  }
}

export {}
