// Is the site up, and does the database need an update? Public, and says nothing more than that.
import { defineRoute } from '#kit'
import { migrationFailure, pendingMigrations } from '#kit/migrations'

export default defineRoute({ public: true, rateLimit: 'default' }, async () => {
  const pending = await pendingMigrations()
  const status = migrationFailure() ? 'update-failed' : pending.length ? 'update-pending' : 'ok'
  return { status, pendingMigrations: pending.length }
})
