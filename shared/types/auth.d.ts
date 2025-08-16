// Type declarations for nuxt-auth-utils
declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    emailVerified: boolean
    setupCompleted: boolean
    roles: string[]
    profile?: {
      name?: string
      avatar?: string | null
    } | null
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
