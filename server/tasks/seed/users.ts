import { db } from '@nuxthub/db'
import { users } from '~~/server/db/schema/user'

/**
 * Mirror rows only — identity is central. No credentials are seeded; dev
 * sessions come from /dev-login.
 */
export async function seedUsers() {
  console.log('👥 Seeding user mirrors...')

  const usersToCreate = [
    { id: 'dev-admin', email: 'dev-admin@proscenium.test', name: 'Dev Admin' },
    { id: 'dev-manager', email: 'dev-manager@proscenium.test', name: 'Dev Manager' },
    { id: 'dev-box-office', email: 'dev-box-office@proscenium.test', name: 'Dev Box Office' },
    { id: 'dev-foh-manager', email: 'dev-foh-manager@proscenium.test', name: 'Dev FOH Manager' },
    { id: 'dev-front-of-house', email: 'dev-front-of-house@proscenium.test', name: 'Dev Front of House' },
    { id: 'dev-user', email: 'dev-user@proscenium.test', name: 'Dev User' },
    { id: 'dev-guest', email: 'dev-guest@proscenium.test', name: 'Dev Guest (shadow)' },
  ]

  const createdUsers = await db.insert(users).values(usersToCreate).returning()
  console.log(`  ✅ Created ${createdUsers.length} user mirrors (log in via /dev-login?staff=admin etc.)`)

  return createdUsers
}
