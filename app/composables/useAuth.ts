import type { RoleType } from '@prisma/client'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  roles: RoleType[]
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  email: string
  password: string
  name?: string
}

export const useAuth = () => {
  const { session, fetch: refreshSession } = useUserSession()

  const user = computed(() => session.value?.user as AuthUser | undefined)
  const isLoggedIn = computed(() => !!user.value)

  const login = async (credentials: LoginCredentials) => {
    const { user } = await $fetch<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: credentials,
    })

    await refreshSession()
    return user
  }

  const register = async (credentials: RegisterCredentials) => {
    const { user } = await $fetch<{ user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: credentials,
    })

    await refreshSession()
    return user
  }

  const logout = async () => {
    await $fetch('/api/auth/logout', {
      method: 'POST',
    })

    await refreshSession()
    await navigateTo('/login')
  }

  const hasRole = (role: RoleType): boolean => {
    if (!user.value) return false
    return user.value.roles.includes(role)
  }

  const hasAnyRole = (roles: RoleType[]): boolean => {
    if (!user.value) return false
    return user.value.roles.some(userRole => roles.includes(userRole))
  }

  const hasAllRoles = (roles: RoleType[]): boolean => {
    if (!user.value) return false
    return roles.every(role => user.value?.roles.includes(role))
  }

  return {
    user: readonly(user),
    isLoggedIn: readonly(isLoggedIn),
    login,
    register,
    logout,
    hasRole,
    hasAnyRole,
    hasAllRoles,
    refresh: refreshSession,
  }
}
