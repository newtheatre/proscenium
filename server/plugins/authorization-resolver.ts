export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    event.context.$authorization = {
      // The epoch check lives in getVerifiedSessionUser so that handlers reading
      // the session directly — rather than through authorize() — can apply the
      // same rule. See server/utils/session.ts.
      resolveServerUser: () => getVerifiedSessionUser(event),
    }
  })
})
