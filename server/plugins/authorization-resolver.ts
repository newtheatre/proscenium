export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    event.context.$authorization = {
      // MUST be the non-throwing resolver — authorize() swallows anything else and
      // then runs the handler unchecked (ADR-0008).
      resolveServerUser: () => sessionUserForAuthorization(event),
    }

    // Keeps the mirror fresh for FK integrity, off the response path. This is
    // the first session read, so 0.secrets-store.ts must run first (ADR-0016).
    const { user } = await getUserSession(event)
    if (user) {
      const upsert = ensureLocalUser(user).catch((error: unknown) => {
        console.error('[mirror] upsert failed:', error)
      })
      event.context.cloudflare?.context.waitUntil(upsert)
    }
  })
})
