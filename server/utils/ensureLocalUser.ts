/**
 * Mirror upsert (stage-door docs/integrating-an-app.md §mirror).
 *
 * `reservations.user_id` FKs a local `users` row (NOT NULL/restrict);
 * identity lives centrally. Authenticated requests upsert the session user
 * into the local mirror — an idempotent primary-key upsert, since the
 * migration made local ids canonical. Debounced per isolate.
 */

import { db, schema } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import type { User } from '#auth-utils'

const lastUpserted = new Map<string, number>()
const UPSERT_INTERVAL_MS = 60_000

export async function ensureLocalUser(user: User): Promise<void> {
  const last = lastUpserted.get(user.id)
  if (last && Date.now() - last < UPSERT_INTERVAL_MS) return

  await db.insert(schema.users)
    .values({ id: user.id, email: user.email, name: user.name })
    .onConflictDoUpdate({
      target: schema.users.id,
      set: {
        email: user.email,
        name: user.name,
        updatedAt: sql`(current_timestamp)`,
      },
    })
  lastUpserted.set(user.id, Date.now())
}
