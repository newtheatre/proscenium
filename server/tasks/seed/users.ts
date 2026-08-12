import { db } from '@nuxthub/db'
import { users } from '~~/server/db/schema/user'

/**
 * Seed Users (mirror rows)
 *
 * Identity lives in the central auth service; locally we only mirror
 * `{ id, email, name }` so reservations have owners. Dev sessions come from
 * `/dev-login` (which mints scoped roles without any password), so no
 * credentials are seeded here — the known-password seed accounts of the old
 * auth stack must not recur (stage-door docs/development.md#seeds).
 */
export async function seedUsers() {
  console.log('👥 Seeding user mirrors...')

  const usersToCreate = [
    { id: 'dev-admin', email: 'dev-admin@proscenium.test', name: 'Dev Admin' },
    { id: 'dev-manager', email: 'dev-manager@proscenium.test', name: 'Dev Manager' },
    { id: 'dev-box-office', email: 'dev-box-office@proscenium.test', name: 'Dev Box Office' },
    { id: 'dev-user', email: 'dev-user@proscenium.test', name: 'Dev User' },
    { id: 'dev-guest', email: 'dev-guest@proscenium.test', name: 'Dev Guest (shadow)' },
  ]

  const createdUsers = await db.insert(users).values(usersToCreate).returning()
  console.log(`  ✅ Created ${createdUsers.length} user mirrors (log in via /dev-login?staff=admin etc.)`)

  return createdUsers
}
