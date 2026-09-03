import type { H3Event } from 'h3'
import type { AccountRow } from '#server/utils/accounts'
import type { NightAuthorityVia, NightRole, NightScope } from '#shared/utils/night-authority'

// Shift-scoped authority, the guard every show-night route calls (E-111). Only the officer branch
// resolves today; the shift branch fills a case in show night wave 3 without changing this (0044).

// The vocabulary it resolves against is `shared/utils/night-authority.ts`, which is where a
// consumer imports `NightRole` and `NightScope` from.
export interface NightAuthority {
  account: AccountRow
  night: string
  role: NightRole
  venueId: string
  performanceIds: string[]
  via: NightAuthorityVia
  shiftId?: string
}

// `performanceIds` is what the request covers; `venuePerformanceIds` is the venue's whole night,
// which is what the audit row carries because it is written once (0044).
interface NightCoverage { venueId: string, performanceIds: string[], venuePerformanceIds: string[] }

// What the scope resolves to on the programme. Authority derives from a performance, so a venue
// with nothing on tonight resolves none of it (0009, E-127 criterion 1).
async function coverage(night: string, scope: NightScope): Promise<NightCoverage> {
  const running = await performancesOnNight(night, scope.venueId)

  if (scope.performanceId) {
    const one = running.find(performance => performance.id === scope.performanceId)
    if (!one) throw createError({ statusCode: 403, statusMessage: 'That performance is not running tonight' })
    const atVenue = running.filter(performance => performance.venueId === one.venueId)
    return { venueId: one.venueId, performanceIds: [one.id], venuePerformanceIds: atVenue.map(performance => performance.id) }
  }

  const venues = [...new Set(running.map(performance => performance.venueId))]
  if (venues.length === 0) {
    throw createError({ statusCode: 403, statusMessage: 'Nothing is running tonight, so there is nothing to take charge of' })
  }
  // Narrowing is the caller's to do: resolving both venues at once would give an officer authority
  // over a house they are not in, and record one row for the pair.
  if (venues.length > 1) {
    throw createError({ statusCode: 400, statusMessage: 'More than one venue is running tonight: name the venue or the performance' })
  }

  const ids = running.map(performance => performance.id)
  return { venueId: venues[0]!, performanceIds: ids, venuePerformanceIds: ids }
}

// The shift branch, which arrives in show night wave 3 (0044). `shifts` does not exist yet, so
// nothing resolves this way and every caller falls through to the officer check below.
async function shiftHeldTonight(): Promise<{ shiftId: string, coverage: NightCoverage } | null> {
  return await Promise.resolve(null)
}

// Tolerates the conflict rather than reading first: the partial unique index is what holds "once
// per officer per night, venue and role", so two simultaneous first requests write one row (0044).
async function recordOfficerBypass(actorId: string, night: string, covered: NightCoverage, role: NightRole): Promise<void> {
  const entry = officerBypassEntry(actorId, night, covered.venueId, role, covered.venuePerformanceIds)
  await db.insert(schema.auditLog).values(entry).onConflictDoNothing()
}

// Hiding a link is never the enforcement (E-111 criterion 5), and the night is `showNightOf`'s
// alone, so authority expires at 04:00 with nothing to revoke and no second boundary anywhere.
export async function requireNightAuthority(event: H3Event, role: NightRole, scope: NightScope = {}): Promise<NightAuthority> {
  const tonight = currentShowNight()
  if (scope.night !== undefined && !isShowNight(scope.night)) {
    throw createError({ statusCode: 400, statusMessage: 'That is not a show night' })
  }
  // A screen left open past 04:00 asks about the night it was showing, and this is where that is
  // refused: authority covers tonight and nothing else (E-111 criterion 2).
  if (scope.night !== undefined && scope.night !== tonight) {
    throw createError({ statusCode: 403, statusMessage: 'Show-night tools open for tonight only, and that night has ended' })
  }

  const resolved = await authority(event)

  const held = await shiftHeldTonight()
  if (held) {
    return {
      account: resolved.account,
      night: tonight,
      role,
      venueId: held.coverage.venueId,
      performanceIds: held.coverage.performanceIds,
      via: 'SHIFT',
      shiftId: held.shiftId,
    }
  }

  if (!resolved.permissions.has(NIGHT_ROLE_PERMISSION[role])) throw createError(nightAuthorityRefusal(role))
  // A bypass is a standing grant being used, so it carries the gate that grant carries elsewhere
  // (A-112). A shift will not, because a shift is not a grant (0044).
  await requireSecondFactorIfPrivileged(event, resolved)

  const covered = await coverage(tonight, scope)
  await recordOfficerBypass(resolved.account.id, tonight, covered, role)

  return {
    account: resolved.account,
    night: tonight,
    role,
    venueId: covered.venueId,
    performanceIds: covered.performanceIds,
    via: 'OFFICER',
  }
}
