import type { PasswordPolicy } from '#shared/utils/auth'

// Read once while rendering, so the rule on the form is the rule the server will enforce (0012).
// Typed explicitly: inferring it from the route map alone has grown too deep for tsc to resolve.
export default defineNuxtPlugin(async () => {
  usePasswordPolicy().value = await useRequestFetch()<PasswordPolicy>('/api/auth/password-policy')
})
