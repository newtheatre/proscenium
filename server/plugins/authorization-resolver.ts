export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    event.context.$authorization = {
      // Staleness enforcement lives in getVerifiedSessionUser so that
      // handlers reading the session directly — rather than through
      // authorize() — apply the same rule. See server/utils/session.ts.
      resolveServerUser: () => getVerifiedSessionUser(event),
    }

    // Keep the local user mirror fresh for FK integrity (reservations
    // require an owner row). Never blocks the request on failure.
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
