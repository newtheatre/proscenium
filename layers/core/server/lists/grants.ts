// Who holds what: the grants list's binding. A grant's state depends on the time and on the
// theatre's warning window (core.grants.expiry-warning), which a binding cannot read, so the data
// route applies the state filter itself from the validated value with grantStates below.
import { or, sql, type SQL } from 'drizzle-orm'
import { defineListSource } from '#kit'
import { grants } from '../db/identity'
import { grantsList } from '../../shared/identity-lists'

export type GrantState = 'live' | 'pending' | 'lapsing' | 'ended'

const ENDED = sql`EXISTS (SELECT 1 FROM core_grant_ends e WHERE e.grant_id = ${grants.id})`
const HOLDER_CLAIMED = sql`(SELECT a.first_signed_in_at FROM core_accounts a WHERE a.id = coalesce((SELECT h.merged_into_id FROM core_accounts h WHERE h.id = ${grants.accountId}), ${grants.accountId})) IS NOT NULL`

/** Each state as one condition at `now`, with grants ending within `window` milliseconds lapsing. The four never overlap. */
export function grantStates(states: readonly string[], now: number, window: number): SQL {
  const notEnded = sql`NOT ${ENDED} AND (${grants.expiresAt} IS NULL OR ${grants.expiresAt} > ${now})`
  const started = sql`${grants.startsAt} <= ${now} AND ${HOLDER_CLAIMED}`
  const each: Record<string, SQL> = {
    ended: sql`(${ENDED} OR ${grants.expiresAt} <= ${now})`,
    pending: sql`(${notEnded} AND NOT (${started}))`,
    lapsing: sql`(${notEnded} AND ${started} AND ${grants.expiresAt} <= ${now + window})`,
    live: sql`(${notEnded} AND ${started} AND (${grants.expiresAt} IS NULL OR ${grants.expiresAt} > ${now + window}))`,
  }
  return or(...states.map(s => each[s]!))!
}

export default defineListSource(grantsList, {
  table: grants,
  filters: {
    // Applied by the data route with grantStates, which needs the theatre's warning window.
    state: { where: () => sql`1` },
    role: { column: 'roleId' },
    scope: { column: 'scope' },
    module: { column: 'scopeModule' },
  },
  sorts: {
    ends: { columns: ['expiresAt'], index: 'core_grants_expiry' },
  },
  search: { person: false, role: false, scope: false, ends: false, state: false },
})
