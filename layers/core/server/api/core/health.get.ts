// Is the site up, and does the database need an update? Public, and says nothing more than that.
import { defineRoute } from '#kit'
import { pendingMigrations } from '#kit/migrations'

export default defineRoute({ public: true, rateLimit: 'default' }, async () => {
  const pending = await pendingMigrations()
  return { status: pending.length ? 'update-pending' : 'ok', pendingMigrations: pending.length }
})
