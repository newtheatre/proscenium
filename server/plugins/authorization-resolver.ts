export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    event.context.$authorization = {
      // MUST be the non-throwing resolver — authorize() swallows anything else and
      // then runs the handler unchecked (ADR-0008).
      resolveServerUser: () => sessionUserForAuthorization(event),
    }

    // Keeps the mirror fresh for FK integrity; never blocks the request. This is
    // the first session read, so 0.secrets-store.ts must run first (ADR-0016).
    const { user } = await getUserSession(event)
    if (user) {
      try {
        await ensureLocalUser(user)
      }
      catch (error) {
        console.error('[mirror] upsert failed:', error)
      }
    }
  })
})
