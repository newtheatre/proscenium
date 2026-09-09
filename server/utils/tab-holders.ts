import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { confirmedShiftsTonight } from '#server/utils/rota'
import { liveGrants } from '#server/utils/authorise'
import { permissionsFor } from '#shared/utils/roles'
import { showNightBounds } from '#shared/utils/show-night'
import type { H3Event } from 'h3'

// Who may charge to a tab, what they already owe, and who may wave a charge past the cap
// (F-108). The charge itself, and the write that posts it, are `server/utils/sale.ts`'s.

// The allow-list is `BAR_AUTHORISED_TAB_HOLDERS`, checked live rather than cached, since a
// revocation has to take effect on the very next charge (criterion 1).
export async function authorisedTabHolder(event: H3Event | undefined, userId: string): Promise<{ id: string, name: string } | null> {
  const authorised = await configValue(event, 'BAR_AUTHORISED_TAB_HOLDERS')
  if (!authorised.includes(userId)) return null

  const [user] = await db.all<{ id: string, name: string }>(sql`
    SELECT id, name FROM users WHERE id = ${userId} AND anonymised_at IS NULL
  `)
  return user ?? null
}

// Every authorised holder's name, for the till's own picker: the allow-list is short by nature
// (a committee-sized set), so one bounded IN query beats one row per config entry (0003).
export async function authorisedTabHolders(event: H3Event | undefined): Promise<{ id: string, name: string }[]> {
  const authorised = await configValue(event, 'BAR_AUTHORISED_TAB_HOLDERS')
  if (authorised.length === 0) return []
  return db.all<{ id: string, name: string }>(sql`
    SELECT id, name FROM users WHERE anonymised_at IS NULL AND id IN (${sql.join(authorised.map(id => sql`${id}`), sql`, `)})
    ORDER BY name COLLATE NOCASE
  `)
}

// The sum of everything charged and not yet settled: never cached, read fresh at every charge
// (F-108 criterion 1, the same reasoning on-hand stock reads fresh, F-105 criterion 5).
export async function outstandingTabBalance(userId: string): Promise<number> {
  const [row] = await db.all<{ total: number }>(sql`
    SELECT coalesce(sum(total_pence), 0) AS total FROM ledger_entries
    WHERE tab_debtor_id = ${userId} AND tab_settled_at IS NULL AND reverses_entry_id IS NULL
  `)
  return row?.total ?? 0
}

// Duty manager or bar manager, checked live rather than trusted from a client-sent flag: it is
// real only because the submitting account actually holds the authority (F-108 criterion 4).
export async function canOverrideTabCap(accountId: string, night: string): Promise<boolean> {
  const permissions = permissionsFor(await liveGrants(accountId), new Date())
  if (permissions.has('bar.write')) return true

  const { from, to } = showNightBounds(night)
  const shifts = await confirmedShiftsTonight(
    accountId, 'DUTY_MANAGER', Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000), {},
  )
  return shifts.length > 0
}
