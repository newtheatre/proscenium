import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    event.context.$authorization = {
      resolveServerUser: async () => {
        const session = await getUserSession(event)
        const sessionUser = session.user
        if (!sessionUser) return null

        // Reject sessions whose epoch is stale. users.sessionEpoch is bumped on
        // role change, password reset and force-logout, so a change takes effect
        // on the next authorized request rather than only at the user's next
        // login. Public endpoints call getUserSession directly and are unaffected.
        const current = await db
          .select({ sessionEpoch: schema.users.sessionEpoch })
          .from(schema.users)
          .where(eq(schema.users.id, sessionUser.id))
          .get()

        if (!current || current.sessionEpoch !== sessionUser.sessionEpoch) return null

        return sessionUser
      },
    }
  })
})
