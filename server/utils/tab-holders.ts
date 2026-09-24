import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { configValue } from '#server/utils/configuration'
import { tabBalanceQuery } from '#server/utils/tab-settlement'
import type { H3Event } from 'h3'
import type { SQL } from 'drizzle-orm'

// Who may charge to a tab, and what they already owe (F-108). The charge and its write are
// `server/utils/sale.ts`'s; who may wave a charge past the cap is `bar-authority.ts`'s.

// Named people, or anybody holding a live grant of a named role (F-108 criterion 1, 0009). Each
// list is one JSON parameter and the grants a subquery, never an expanded id list (0003, 0006).
export function authorisedTabHoldersQuery(ids: readonly string[], roles: readonly string[], now: number, only?: string): SQL {
  return sql`
    SELECT u.id, u.name FROM users u
    WHERE u.anonymised_at IS NULL
      ${only === undefined ? sql`` : sql`AND u.id = ${only}`}
      AND (
        u.id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))
        OR EXISTS (
          SELECT 1 FROM role_grants rg
          WHERE rg.user_id = u.id
            AND rg.role IN (SELECT value FROM json_each(${JSON.stringify(roles)}))
            AND (rg.expires_at IS NULL OR rg.expires_at > ${now})
        )
      )
    ORDER BY u.name COLLATE NOCASE
  `
}

async function holders(event: H3Event | undefined, only?: string): Promise<{ id: string, name: string }[]> {
  const ids = await configValue(event, 'BAR_AUTHORISED_TAB_HOLDERS')
  const roles = await configValue(event, 'BAR_AUTHORISED_TAB_ROLES')
  if (ids.length === 0 && roles.length === 0) return []
  return db.all<{ id: string, name: string }>(authorisedTabHoldersQuery(ids, roles, Math.floor(Date.now() / 1000), only))
}

// Checked live rather than cached, since a revocation or a lapsed grant has to take effect on the
// very next charge (criterion 1).
export async function authorisedTabHolder(event: H3Event | undefined, userId: string): Promise<{ id: string, name: string } | null> {
  const [holder] = await holders(event, userId)
  return holder ?? null
}

// Every authorised holder's name, for the till's own picker.
export function authorisedTabHolders(event: H3Event | undefined): Promise<{ id: string, name: string }[]> {
  return holders(event)
}

// Never cached, read fresh at every charge (F-108 criterion 1, the same reasoning on-hand stock
// reads fresh). A charge is never marked settled on its own row (0010, F-109).
export async function outstandingTabBalance(userId: string): Promise<number> {
  const [row] = await db.all<{ total: number }>(tabBalanceQuery(userId))
  return row?.total ?? 0
}
