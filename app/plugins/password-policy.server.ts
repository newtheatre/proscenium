import type { PasswordPolicy } from '#shared/utils/auth'

// Read once while rendering (0012). Both generics are load-bearing: the second, widened to
// string, trades away the route-literal check to stay under tsc's depth limit (0053 amendment).
export default defineNuxtPlugin(async () => {
  usePasswordPolicy().value = await useRequestFetch()<PasswordPolicy, string>('/api/auth/password-policy')
})
