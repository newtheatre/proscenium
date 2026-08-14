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
    //
    // NOTE: this is the estate's first session read of the request, and
    // nuxt-auth-utils memoises the session password on it for the life of the
    // isolate. `server/plugins/0.secrets-store.ts` must therefore have run
    // first — its `0.` prefix is what guarantees that. If you add a plugin
    // that reads the session, or rename that file, read its header first.
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
