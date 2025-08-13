import type { RoleType } from '@prisma/client'

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

  const user = computed(() => session.value?.user)
  const isLoggedIn = computed(() => !!user.value)

  const login = async (credentials: LoginCredentials) => {
    const response = await $fetch('/api/auth/login', {
      method: 'POST',
      body: credentials,
    })

    console.log('Login response:', response)

    await refreshSession()
    return response.data!.user
  }

  const register = async (credentials: RegisterCredentials) => {
    const result = await $fetch('/api/auth/register', {
      method: 'POST',
      body: credentials,
    })

    // Note: Don't refresh session here since user needs to verify email first
    return result
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
    return user.value.roles.some(userRole => roles.includes(userRole as RoleType))
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
