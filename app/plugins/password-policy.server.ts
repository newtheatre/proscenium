// Read once while rendering, so the rule on the form is the rule the server will enforce (0012).
export default defineNuxtPlugin(async () => {
  usePasswordPolicy().value = await useRequestFetch()('/api/auth/password-policy')
})
