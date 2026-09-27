// Resolves the viewer an ability is checked against. Sorted after 0.secrets-store, which must
// still run first, and lazy on purpose: a public request must not pay for the queries below.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.context.$authorization = {
      resolveServerUser: async <User extends Record<string, unknown>>(): Promise<User | null> => {
        const account = await currentAccount(event)
        if (!account) return null
        return await viewerFacts(event, account.id) as unknown as User
      },
    }
  })
})
