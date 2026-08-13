export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    event.context.$authorization = {
      // MUST be the non-throwing resolver: nuxt-authorization's authorize()
      // swallows any non-AuthorizationError its resolver throws and then
      // resolves successfully, running the handler unguarded. Staleness is
      // therefore applied by dropping roles, not by throwing. See the note on
      // sessionUserForAuthorization in server/utils/session.ts.
      resolveServerUser: () => sessionUserForAuthorization(event),
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
