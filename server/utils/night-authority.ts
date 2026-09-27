import type { H3Event } from 'h3'
import type { AccountRow } from '#server/utils/accounts'
import type { Authority } from '#server/utils/authorise'
import type { NightAuthorityVia, NightRefusalKind, NightRole, NightScope, RecordsRead } from '#shared/utils/night-authority'

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
    if (!venue) throw noSuch('venue')

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

// A read that decrypts access-profile wording (D-127) sets `recordsRead`, so an officer reading
// it is recorded as an act would be (0098).
export interface NightAuthorityOptions { recordsRead?: RecordsRead }

interface Caller { resolved: Authority, tonight: string }
interface Refusal { kind: NightRefusalKind, error: unknown }

const isAuthority = (answer: NightAuthority | ShiftBranch): answer is NightAuthority => 'via' in answer

// Identity first, so a signed-out caller is told that and cannot read tonight's date off which
// refusal it gets back; then the night asked about, which is tonight or nothing (E-111 criterion 2).
async function callerTonight(event: H3Event, scope: NightScope): Promise<Caller> {
  const resolved = await authority(event)
  const tonight = currentShowNight()
  if (scope.night !== undefined && !isShowNight(scope.night)) {
    throw createError({ statusCode: 400, statusMessage: 'That is not a show night' })
  }
  // A screen left open past 04:00 asks about the night it was showing, and this is where it is refused.
  if (scope.night !== undefined && scope.night !== tonight) {
    throw createError({ statusCode: 403, statusMessage: 'Show-night tools open for tonight only, and that night has ended' })
  }
  return { resolved, tonight }
}

// Tonight's confirmed duty manager opens the door for their own performance and window, after
// every shift and before any bypass, recorded once when they act (0095, E-111 criterion 1).
async function throughCover(event: H3Event, { resolved, tonight }: Caller, scope: NightScope, options: NightAuthorityOptions): Promise<NightAuthority | ShiftBranch> {
  const held = await shiftHeldTonight(event, resolved.account.id, 'DUTY_MANAGER', tonight, scope)
  if (!held.coverage) return held
  if (bypassIsRecorded(event.method, recordsReadFor(options.recordsRead, 'DOOR'))) {
    // Written once a night and venue, so it names every house this duty manager runs there.
    const { from, to } = showNightBounds(tonight)
    const own = await confirmedShiftsTonight(
      resolved.account.id, 'DUTY_MANAGER', Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000),
      { venueId: held.coverage.venueId },
    )
    await recordDoorCover(doorCoverEntry(resolved.account.id, tonight, held.coverage.venueId, own.map(row => row.performanceId)))
  }
  return {
    account: resolved.account,
    night: tonight,
    role: 'DOOR',
    venueId: held.coverage.venueId,
    performanceIds: held.coverage.performanceIds,
    via: 'COVER',
    shiftId: held.shiftId,
  }
}

// The shift branch alone (0044): the authority a confirmed shift in its window gives, or what the
// lookup found short of it, so a refusal is only worked out when one is thrown (0078).
async function throughShift(
  event: H3Event,
  { resolved, tonight }: Caller,
  role: NightRole,
  scope: NightScope,
): Promise<NightAuthority | ShiftBranch> {
  const held = await shiftHeldTonight(event, resolved.account.id, role, tonight, scope)
  if (!held.coverage) return held
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

// Somebody holding tonight's shift at the wrong hour is told the hours, and a claim still waiting
// is named with who confirms it, rather than either being refused as no shift at all (issue 1303).
async function shiftRefusal({ resolved, tonight }: Caller, role: NightRole, scope: NightScope, held: ShiftBranch): Promise<Refusal> {
  if (held.outsideWindow) return { kind: 'OUTSIDE_WINDOW', error: createError(outsideWindowRefusal(held.outsideWindow)) }
  if (await claimedShiftTonight(resolved.account.id, role, tonight, scope)) {
    return { kind: 'CLAIMED', error: createError(claimedShiftRefusal(role)) }
  }
  // The door points to tonight's duty manager, who can open it for their own performance (0095).
  const dutyManager = role === 'DOOR' ? await dutyManagerTonight(resolved.account.id, tonight, scope) : null
  return { kind: 'NO_SHIFT', error: createError(nightAuthorityRefusal(role, dutyManager)) }
}

// The officer branch (0044), for a caller holding the role's permission: a standing grant being
// used, so it carries the second factor that grant carries elsewhere (A-112).
async function throughBypass(
  event: H3Event,
  { resolved, tonight }: Caller,
  role: NightRole,
  scope: NightScope,
  options: NightAuthorityOptions,
): Promise<NightAuthority> {
  await requireSecondFactorIfPrivileged(event, resolved)
  const covered = await coverage(tonight, role, scope)
  // Recorded when the officer acts, never when a screen merely looks (0098).
  if (bypassIsRecorded(event.method, recordsReadFor(options.recordsRead, role))) await recordOfficerBypass(resolved.account.id, tonight, covered, role)
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

// Hiding a link is never the enforcement (E-111 criterion 5), and the night is `showNightOf`'s
// alone, so authority expires at 04:00 with nothing to revoke and no second boundary anywhere.
export async function requireNightAuthority(
  event: H3Event,
  role: NightRole,
  scope: NightScope = {},
  options: NightAuthorityOptions = {},
): Promise<NightAuthority> {
  const caller = await callerTonight(event, scope)
  let answer = await throughShift(event, caller, role, scope)
  if (isAuthority(answer)) return answer
  if (role === 'DOOR') {
    const cover = await throughCover(event, caller, scope, options)
    if (isAuthority(cover)) return cover
    // The door's own hours win; with none, a duty manager outside theirs is told those.
    if (!answer.outsideWindow) answer = cover
  }
  // An officer holding tonight's shift at the wrong hour keeps their bypass all the same (0078).
  if (!caller.resolved.permissions.has(NIGHT_ROLE_PERMISSION[role])) throw (await shiftRefusal(caller, role, scope, answer)).error
  return throughBypass(event, caller, role, scope, options)
}

interface ShortOfAuthority { short: { role: NightRole, held: ShiftBranch }[], refusals: Refusal[] }

// Every role's shift is tried, then door cover, then any bypass, so a shift that answers records
// neither (0095, 0098). Short of authority, it hands back what the guard needs to say why.
async function firstAuthority(
  event: H3Event,
  caller: Caller,
  roles: NightRole[],
  scope: NightScope,
  options: NightAuthorityOptions,
): Promise<NightAuthority | ShortOfAuthority> {
  const short: ShortOfAuthority['short'] = []
  const refusals: Refusal[] = []
  for (const role of roles) {
    try {
      const answer = await throughShift(event, caller, role, scope)
      if (isAuthority(answer)) return answer
      short.push({ role, held: answer })
    }
    catch (error) {
      refusals.push({ kind: 'ASKED', error })
    }
  }
  if (roles.includes('DOOR')) {
    try {
      const cover = await throughCover(event, caller, scope, options)
      if (isAuthority(cover)) return cover
      const door = short.find(one => one.role === 'DOOR')
      if (door && !door.held.outsideWindow) door.held = cover
    }
    catch (error) {
      refusals.push({ kind: 'ASKED', error })
    }
  }
  for (const role of roles) {
    if (!caller.resolved.permissions.has(NIGHT_ROLE_PERMISSION[role])) continue
    try {
      return await throughBypass(event, caller, role, scope, options)
    }
    catch (error) {
      refusals.push({ kind: 'ASKED', error })
    }
  }
  return { short, refusals }
}

// For a screen more than one role reaches (E-118 criterion 4).
export async function requireAnyNightAuthority(
  event: H3Event,
  roles: NightRole[],
  scope: NightScope = {},
  options: NightAuthorityOptions = {},
): Promise<NightAuthority> {
  const caller = await callerTonight(event, scope)
  const found = await firstAuthority(event, caller, roles, scope, options)
  if (isNightAuthority(found)) return found
  // The refusal about the caller's own position, never merely the last role asked (issue 1303).
  const refusals = [...found.refusals]
  for (const { role, held } of found.short) refusals.push(await shiftRefusal(caller, role, scope, held))
  throw mostSpecificRefusal(refusals)?.error ?? createError(nightAuthorityRefusal('DUTY_MANAGER'))
}

// The same steps for a screen anyone signed in may read, which only adds what tonight's team may
// see: null where the guard would refuse, without working out a refusal nobody reads.
export async function nightAuthorityIfAny(
  event: H3Event,
  roles: NightRole[],
  scope: NightScope = {},
  options: NightAuthorityOptions = {},
): Promise<NightAuthority | null> {
  const found = await firstAuthority(event, await callerTonight(event, scope), roles, scope, options)
  return isNightAuthority(found) ? found : null
}

function isNightAuthority(found: NightAuthority | ShortOfAuthority): found is NightAuthority {
  return 'via' in found
}
