import type { H3Event } from 'h3'
import type { AccountRow } from '#server/utils/accounts'
import type { NightAuthorityVia, NightRole, NightScope } from '#shared/utils/night-authority'

// Shift-scoped authority, the guard every show-night route calls (E-111). A confirmed shift is
// tried first and the officer bypass falls through only when no shift covers the request (0044).

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
  // Named where the evening is a bar opening; `performanceIds` is then empty, which is what "this
  // evening covers no performance" has always meant to a caller that iterates it (0077).
  openingId?: string
}

// `performanceIds` is what the request covers; `venuePerformanceIds` is the venue's whole night,
// which is what the audit row carries because it is written once (0044).
interface NightCoverage { venueId: string, performanceIds: string[], venuePerformanceIds: string[], openingId?: string }

// Narrowing is the caller's to do: resolving two venues at once hands out authority over a house
// nobody asked about. Shared, so both branches refuse it the same way (E-127 criterion 1).
function refuseAmbiguousVenue(venues: string[]): void {
  if (venues.length > 1) {
    throw createError({ statusCode: 400, statusMessage: 'More than one venue is running tonight: name the venue or the performance' })
  }
}

// What the scope resolves to on the programme. Authority derives from a performance, so a venue
// with nothing on tonight resolves none of it (0009, E-127 criterion 1).
async function coverage(night: string, role: NightRole, scope: NightScope): Promise<NightCoverage> {
  // A cancelled performance is not a night's work: the house never opens, so nothing derives from
  // it and no bypass is recorded against it (D-121 criterion 5).
  const running = (await performancesOnNight(night, scope.venueId)).filter(one => one.status !== 'CANCELLED')

  if (scope.performanceId) {
    const one = running.find(performance => performance.id === scope.performanceId)
    if (!one) throw createError({ statusCode: 403, statusMessage: 'That performance is not running tonight' })
    const atVenue = running.filter(performance => performance.venueId === one.venueId)
    return { venueId: one.venueId, performanceIds: [one.id], venuePerformanceIds: atVenue.map(performance => performance.id) }
  }

  const venues = [...new Set(running.map(performance => performance.venueId))]
  if (venues.length === 0) {
    // The bar opens on a hire night and the door does not: with no house there is no admission to
    // take and no evening to run, but there is money to take at the bar (0077).
    if (role !== 'BAR') {
      throw createError({ statusCode: 403, statusMessage: 'Nothing is running tonight, so there is nothing to take charge of' })
    }
    if (!scope.venueId) {
      throw createError({ statusCode: 400, statusMessage: 'Nothing is running tonight: name the venue whose bar you are opening' })
    }
    // Every other path takes its venue from the programme, which is what proves the venue exists;
    // this one is handed one, so it reads it rather than recording a bypass against a typo.
    const venue = await venueById(scope.venueId)
    if (!venue) throw createError({ statusCode: 404, statusMessage: 'No such venue' })

    const openingId = await plannedOpeningTonight(scope.venueId, night)
    return { venueId: scope.venueId, performanceIds: [], venuePerformanceIds: [], openingId: openingId ?? undefined }
  }
  refuseAmbiguousVenue(venues)

  const ids = running.map(performance => performance.id)
  return { venueId: venues[0]!, performanceIds: ids, venuePerformanceIds: ids }
}

// A shift held tonight but not now: the refusal the caller gets only if nothing else lets them
// in, because an officer who also happens to be rostered keeps their bypass (0044, 0078).
interface ShiftBranch { shiftId?: string, coverage?: NightCoverage, outsideWindow?: string }

// The shift branch (0044): a confirmed shift of this role, held by this account, on one of
// tonight's performances, refusing the same ambiguity the officer branch does (E-127 criterion 1).
async function shiftHeldTonight(
  event: H3Event,
  accountId: string,
  role: NightRole,
  night: string,
  scope: NightScope,
): Promise<ShiftBranch> {
  const { from, to } = showNightBounds(night)
  const bounds: [number, number] = [Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000)]
  const grace = await configValue(event, 'SHIFT_AUTHORITY_GRACE_MINUTES')
  const at = Math.floor(Date.now() / 1000)

  const rows = await confirmedShiftsTonight(
    accountId, role, bounds[0], bounds[1],
    { venueId: scope.venueId, performanceId: scope.performanceId },
  )
  const worked = rows.filter(row => insideWindow(row, at, grace))

  if (worked.length > 0) {
    const venues = [...new Set(worked.map(row => row.venueId))]
    refuseAmbiguousVenue(venues)

    const performanceIds = worked.map(row => row.performanceId)
    return {
      shiftId: worked[0]!.shiftId,
      coverage: { venueId: venues[0]!, performanceIds, venuePerformanceIds: performanceIds },
    }
  }

  // Tried second, so somebody holding both resolves through the performance and keeps its ids;
  // a performance shift out of window does not stand in the way of an opening in one (0077).
  const openings = role === 'BAR'
    ? await confirmedOpeningShiftsTonight(accountId, bounds[0], bounds[1], { venueId: scope.venueId })
    : []
  const open = openings.filter(row => insideWindow(row, at, grace))

  if (open.length > 0) {
    const venues = [...new Set(open.map(row => row.venueId))]
    refuseAmbiguousVenue(venues)

    return {
      shiftId: open[0]!.shiftId,
      coverage: { venueId: venues[0]!, performanceIds: [], venuePerformanceIds: [], openingId: open[0]!.openingId },
    }
  }

  // The window nearest now, never the first row: on a two-house day the earliest is the one
  // already finished, and quoting it would send a volunteer away at the wrong hour (0078).
  const held = [...rows, ...openings].filter(row => row.startsAt !== null && row.endsAt !== null)
  const nearest = nearestWindow(held as { startsAt: number, endsAt: number }[], at)
  return nearest ? { outsideWindow: saysWindow(nearest) } : {}
}

// Tolerates the conflict rather than reading first: the partial unique index is what holds "once
// per officer per night, venue and role", so two simultaneous first requests write one row (0044).
async function recordOfficerBypass(actorId: string, night: string, covered: NightCoverage, role: NightRole): Promise<void> {
  const entry = officerBypassEntry(actorId, night, covered.venueId, role, covered.venuePerformanceIds, covered.openingId)
  await db.insert(schema.auditLog).values(entry).onConflictDoNothing()
}

// Hiding a link is never the enforcement (E-111 criterion 5), and the night is `showNightOf`'s
// alone, so authority expires at 04:00 with nothing to revoke and no second boundary anywhere.
export async function requireNightAuthority(event: H3Event, role: NightRole, scope: NightScope = {}): Promise<NightAuthority> {
  // Identity first, so a signed-out caller is told that and cannot read tonight's date off which
  // refusal it gets back.
  const resolved = await authority(event)

  const tonight = currentShowNight()
  if (scope.night !== undefined && !isShowNight(scope.night)) {
    throw createError({ statusCode: 400, statusMessage: 'That is not a show night' })
  }
  // A screen left open past 04:00 asks about the night it was showing, and this is where that is
  // refused: authority covers tonight and nothing else (E-111 criterion 2).
  if (scope.night !== undefined && scope.night !== tonight) {
    throw createError({ statusCode: 403, statusMessage: 'Show-night tools open for tonight only, and that night has ended' })
  }

  const held = await shiftHeldTonight(event, resolved.account.id, role, tonight, scope)
  if (held.coverage) {
    return {
      account: resolved.account,
      night: tonight,
      role,
      venueId: held.coverage.venueId,
      performanceIds: held.coverage.performanceIds,
      via: 'SHIFT',
      shiftId: held.shiftId,
      openingId: held.coverage.openingId,
    }
  }

  // Somebody holding tonight's shift at the wrong hour is told the hours, not sent to find an
  // officer they do not need; an officer holding one keeps their bypass all the same (0078).
  if (!resolved.permissions.has(NIGHT_ROLE_PERMISSION[role])) {
    throw createError(held.outsideWindow ? outsideWindowRefusal(held.outsideWindow) : nightAuthorityRefusal(role))
  }
  // A bypass is a standing grant being used, so it carries the gate that grant carries elsewhere
  // (A-112). A shift will not, because a shift is not a grant (0044).
  await requireSecondFactorIfPrivileged(event, resolved)

  const covered = await coverage(tonight, role, scope)
  await recordOfficerBypass(resolved.account.id, tonight, covered, role)

  return {
    account: resolved.account,
    night: tonight,
    role,
    venueId: covered.venueId,
    performanceIds: covered.performanceIds,
    via: 'OFFICER',
    openingId: covered.openingId,
  }
}

// For a screen more than one role reaches (E-118 criterion 4). Tried in order, first success
// wins; a signed-out caller is told that immediately rather than asked again for each role.
export async function requireAnyNightAuthority(event: H3Event, roles: NightRole[], scope: NightScope = {}): Promise<NightAuthority> {
  let refusal: unknown
  for (const role of roles) {
    try {
      return await requireNightAuthority(event, role, scope)
    }
    catch (error) {
      if ((error as { statusCode?: number }).statusCode === 401) throw error
      refusal = error
    }
  }
  throw refusal
}
