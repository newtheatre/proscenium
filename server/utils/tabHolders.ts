import { db, schema } from '@nuxthub/db'
import { and, inArray, isNull } from 'drizzle-orm'

/**
 * Who may hold a bar tab, read from stage-door behind one seam. Roles live
 * there and never here (ADR-0030).
 */

/** Advisory-fresh. The list changes when committee turns over, not hourly. */
const CACHE_TTL_MS = 10 * 60 * 1000

export interface TabHolder {
  userId: string
  name: string
}

interface CacheEntry { holders: TabHolder[], at: number }

// Per-isolate, to avoid asking stage-door once per keystroke. Never longer:
// an isolate is reused across users and this is not per-user data.
let cache: CacheEntry | null = null

/** Our own roles that carry `bar.tab`, from the manifest that defines them. */
function rolesCarryingBarTab(): string[] {
  return APP_MANIFEST.roles
    .filter(role => (role.permissions as readonly string[]).includes('bar.tab'))
    .map(role => role.role)
}

/**
 * The people the till may start a tab for, or `null` when stage-door cannot
 * say. Null is "ask by email instead", never "nobody".
 */
export async function tabHolders(): Promise<TabHolder[] | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.holders

  const config = useRuntimeConfig()
  if (!config.authServiceToken) return cache?.holders ?? null

  try {
    const response = await $fetch<{ holders: Array<{ id: string, name: string }> }>(
      `${config.public.authBaseURL}/api/role-holders`,
      {
        query: { roles: rolesCarryingBarTab().join(',') },
        headers: { Authorization: `Bearer ${config.authServiceToken}` },
        timeout: 4000,
      },
    )

    // A tab is a foreign key onto our mirror, so somebody who has never signed
    // in here cannot hold one and must not be offered.
    const holders = await mirroredHolders(response.holders)
    cache = { holders, at: Date.now() }
    return holders
  }
  catch (error) {
    console.error('[tabHolders] could not reach stage-door for the holder list:', error)
    // Stale beats nothing, and nothing beats a wrong answer: the till falls
    // back to the email lookup, which is always correct.
    return cache?.holders ?? null
  }
}

/** Only holders we already mirror, since the debtor column is a restricted FK. */
async function mirroredHolders(holders: Array<{ id: string, name: string }>): Promise<TabHolder[]> {
  if (!holders.length) return []

  const found: TabHolder[] = []
  // Chunked so the parameter count is fixed however many hold the role (ADR-0006).
  for (const group of chunked(holders, 20)) {
    const rows = await db.select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(and(
        inArray(schema.users.id, group.map(holder => holder.id)),
        // An erased account keeps its debt but must never be offered a new tab.
        isNull(schema.users.anonymisedAt),
      ))
    for (const row of rows) found.push({ userId: row.id, name: row.name })
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

/** Whether a named person may be given a tab, when we can tell (docs/09 #22). */
export async function mayHoldTab(userId: string): Promise<boolean | null> {
  const holders = await tabHolders()
  if (!holders) return null
  return holders.some(holder => holder.userId === userId)
}

/** Testing seam: the cache is per-isolate and otherwise invisible. */
export function clearTabHolderCache() {
  cache = null
}
