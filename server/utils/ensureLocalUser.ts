/**
 * Mirror upsert (stage-door docs/integrating-an-app.md §mirror).
 *
 * `reservations.user_id` FKs a local `users` row (NOT NULL/restrict);
 * identity lives centrally. Authenticated requests upsert the session user
 * into the local mirror — an idempotent primary-key upsert, since the
 * migration made local ids canonical. Debounced per isolate.
 */

import { db, schema } from '@nuxthub/db'
import { isNull, sql } from 'drizzle-orm'
import type { User } from '#auth-utils'

const lastUpserted = new Map<string, number>()
const UPSERT_INTERVAL_MS = 60_000
/**
 * Cap the debounce map so a long-lived isolate serving many distinct users
 * cannot grow it without bound inside a 128 MB Worker. Entries are worthless
 * once older than UPSERT_INTERVAL_MS anyway, so evicting is free.
 */
const MAX_DEBOUNCE_ENTRIES = 5_000

function rememberUpsert(userId: string, now: number): void {
  if (lastUpserted.size >= MAX_DEBOUNCE_ENTRIES) {
    for (const [id, at] of lastUpserted) {
      if (now - at >= UPSERT_INTERVAL_MS) lastUpserted.delete(id)
    }
    // Still full: every entry is fresh, so drop the oldest insertion (Map
    // iterates in insertion order) rather than let the map grow.
    if (lastUpserted.size >= MAX_DEBOUNCE_ENTRIES) {
      const oldest = lastUpserted.keys().next()
      if (!oldest.done) lastUpserted.delete(oldest.value)
    }
  }
  lastUpserted.set(userId, now)
}

export async function ensureLocalUser(user: User): Promise<void> {
  const now = Date.now()
  const last = lastUpserted.get(user.id)
  if (last && now - last < UPSERT_INTERVAL_MS) return

  await db.insert(schema.users)
    .values({ id: user.id, email: user.email, name: user.name })
    .onConflictDoUpdate({
      target: schema.users.id,
      set: {
        email: user.email,
        name: user.name,
        updatedAt: sql`(current_timestamp)`,
      },
      // Never resurrect an erased account. stage-door's eraseUser bumps
      // session_epoch and disables the auth row, but this app cannot see the
      // epoch — it only learns of revocation when a *role-holding* session
      // goes stale (15 min). A customer holds no roles, so their sealed cookie
      // stays readable for the full 30-day maxAge, and this hook runs on every
      // request. Without this guard the erased person's own browser writes
      // their real name and email straight back over the scrubbed row, while
      // `anonymisedAt` stays set so the row remains hidden from listings — the
      // erasure looks done and silently is not.
      setWhere: isNull(schema.users.anonymisedAt),
    })
  rememberUpsert(user.id, now)
}
