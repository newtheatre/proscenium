// Warnings that roles are about to lapse (ID-24; identity spec part 4). Once a day the sweep picks up
// every live grant that will be inside core.grants.expiry-warning of its end before the day is out
// and has not been warned of, records it in core_grant_warnings, and tells two groups once each:
// every holder, in one message naming each of their roles that is ending (core.grant-expiring), and
// whoever could renew those grants, in one message with a count and the earliest end
// (core.grants-expiring), because at a year end most grants lapse together. A renewer holds
// core.grant.manage at the grant's scope and could give the role themself; Owner is renewed only by
// an Owner. Neither message is sent twice in a day: the dedupe key is the type and the theatre's date.
import { all, nowMs, theatreTimeZone, useSetting, type Actor, type UnitView } from '#kit'
import { instantOfLocal, localDateOf, previousDate } from '#kit/clock'
import { notify } from '../notifications/notify'
import { canonicalAccount } from './accounts'
import { LIVE, OWNER, isOwner, roleAbilities } from './grants'
import { holdersOf } from './holders'
import { notHeld, scopeOf, type GrantRow } from './roles'

const BATCH = 200 // not-policy: grants warned of in one sweep; the rest wait for the next

interface Due extends GrantRow { role_key: string, role_name: string }

/** The last day a grant counts, in the theatre's time zone: an end is the first moment of the next day. */
function lastDay(expiresAt: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone }).format(expiresAt - 1)
}

export async function warnOfLapsingGrants(unit: UnitView): Promise<void> {
  // Before setup has set the time zone there is no theatre day to count in, and no roles to warn of.
  if (!await useSetting('core.locale.time-zone')) return
  const at = nowMs()
  const timeZone = await theatreTimeZone()
  const today = localDateOf(at, timeZone)
  const endOfToday = instantOfLocal(previousDate(today, -1), '00:00', timeZone)
  const ahead = (await useSetting('core.grants.expiry-warning') as number) * 1000 // not-policy: seconds to milliseconds
  const due = await all<Due>(
    `SELECT g.*, r.key AS role_key, r.name AS role_name
       FROM core_grants g JOIN core_roles r ON r.id = g.role_id AND r.archived_at IS NULL
      WHERE g.expires_at IS NOT NULL AND g.expires_at <= ? AND ${LIVE}
        AND NOT EXISTS (SELECT 1 FROM core_grant_warnings w WHERE w.grant_id = g.id)
      ORDER BY g.expires_at, g.id LIMIT ?`,
    endOfToday + ahead, at, at, BATCH,
  )
  if (!due.length) return

  unit.add({
    sql: `INSERT INTO core_grant_warnings (grant_id, warned_at) VALUES ${due.map(() => '(?, ?)').join(', ')}`,
    params: due.flatMap(g => [g.id, at]),
  })

  // Each holder: one line per role ending, soonest first.
  const holders = new Map<string, string[]>()
  for (const grant of due) {
    const holder = await canonicalAccount(grant.account_id)
    holders.set(holder, [...holders.get(holder) ?? [], `- ${grant.role_name}, until ${lastDay(grant.expires_at!, timeZone)}`])
  }
  await notify(unit, 'core.grant-expiring', {
    to: [...holders].map(([accountId, lines]) => ({ accountId, variables: { roles: lines.join('\n') } })),
    dedupeKey: `core.grant-expiring:${today}`,
  })

  // Each renewer: how many they could renew, and the first of them to end.
  const renewers = new Map<string, { count: number, first: number }>()
  const managers = new Map<string, string[]>()
  for (const grant of due) {
    const scope = scopeOf(grant)
    const key = scope.kind === 'record' ? `${scope.type}:${scope.id}` : 'site'
    if (!managers.has(key)) managers.set(key, await holdersOf('core.grant.manage', scope.kind === 'record' ? [scope.type, scope.id] : undefined))
    const holder = await canonicalAccount(grant.account_id)
    const abilities = await roleAbilities(grant.role_id, grant.role_key)
    for (const accountId of managers.get(key)!) {
      if (accountId === holder) continue
      if (grant.role_key === OWNER ? !(await isOwner(accountId)) : (await notHeld(asPerson(accountId, at), abilities, scope)).length) continue
      const seen = renewers.get(accountId)
      renewers.set(accountId, { count: (seen?.count ?? 0) + 1, first: Math.min(seen?.first ?? Infinity, grant.expires_at!) })
    }
  }
  await notify(unit, 'core.grants-expiring', {
    to: [...renewers].map(([accountId, r]) => ({ accountId, variables: { count: String(r.count), date: lastDay(r.first, timeZone) } })),
    dedupeKey: `core.grants-expiring:${today}`,
  })
}

/** A renewer as the grant screen would see them: signed in strongly, just now. */
function asPerson(accountId: string, at: number): Actor {
  return { kind: 'person', accountId, assurance: 'strong', reassertedAt: at }
}
