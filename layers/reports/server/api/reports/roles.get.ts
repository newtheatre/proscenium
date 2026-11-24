// The roles a saved report can be shared with (D4).
import { defineRoute, all } from '#kit'

export default defineRoute({ ability: 'reports.report.create', rateLimit: 'default' }, async () => ({
  roles: await all<{ id: string, name: string }>('SELECT id, name FROM core_roles WHERE archived_at IS NULL ORDER BY lower(name)'),
}))
