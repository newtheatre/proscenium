declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    name: string
    verified: boolean
    roles: Array<'ADMIN' | 'MANAGER' | 'BOX_OFFICE'>
  }

  interface UserSession {
    loggedInAt: Date
  }

  interface SecureSessionData {
    // Add any secure server-only data here
    // For now, keeping empty - add properties as needed
    [key: string]: unknown
  }
}

export {}
