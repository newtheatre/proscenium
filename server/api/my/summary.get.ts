import type { MyShiftRow } from '#server/utils/rota'

// The one request `/my` makes (K-127 criterion 1): eight endpoints' worth of reading composed
// here instead, so a tile never fans out on its own.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const now = new Date()
  const nowSeconds = Math.floor(now.getTime() / 1000)
  const today = londonToday(now)

  const [graceDays, closesHours, limitedPercent, year] = await Promise.all([
    configValue(event, 'MEMBERSHIP_GRACE_DAYS'),
    configValue(event, 'SESSION_SIGNUP_CLOSES_HOURS'),
    configValue(event, 'LISTING_LIMITED_THRESHOLD_PERCENT'),
    academicYear(event),
  ])

  const [
    shifts,
    membershipTerm,
    claim,
    room,
    modules,
    held,
    nextStep,
    sessions,
    passes,
    passRequest,
    notifications,
    listing,
  ] = await Promise.all([
    db.all<MyShiftRow>(myShiftsQuery(account.id, nowSeconds)),
    longestTerm(account.id),
    ownClaim(account.id),
    nextRoomBooking(account.id, nowSeconds),
    listModules({ includeDrafts: false, includeRetired: false }, year, false),
    modulesHeldBy(account.id, today),
    whatsNextFor(account.id, today),
    sessionsForMember(account.id, today, closesHours),
    activePasses(account.id),
    openPassRequest(account.id),
    recentInbox(account.id, 3),
    publicListing(limitedPercent, 1, 1, now),
  ])

  const nextSignedUpSession = sessions
    .filter(session => session.myStatus !== null)
    .sort((a, b) => `${a.heldOn}T${a.startsAt}`.localeCompare(`${b.heldOn}T${b.startsAt}`))[0]
  const listedShow = listing.items[0]

  return assembleMySummary({
    now,
    viewerId: account.id,
    shift: shifts[0]
      ? {
          shiftId: shifts[0].shiftId,
          role: shifts[0].role,
          status: shifts[0].status,
          venueName: shifts[0].venueName,
          showTitle: shifts[0].showTitle,
          startsAt: shifts[0].startsAt,
        }
      : null,
    membershipTerm,
    membershipGraceDays: graceDays,
    claim: claim ? { status: claim.status } : null,
    room: room ?? null,
    trainingHeld: held.size,
    trainingAvailable: modules.length,
    nextStep: nextStep[0] ? { id: nextStep[0].id, name: nextStep[0].name } : null,
    nextSession: nextSignedUpSession
      ? {
          id: nextSignedUpSession.id,
          moduleName: nextSignedUpSession.modules[0]?.name ?? '',
          heldOn: nextSignedUpSession.heldOn,
          startsAt: nextSignedUpSession.startsAt,
          place: nextSignedUpSession.place,
        }
      : null,
    passes,
    passRequest: passRequest ?? null,
    notifications,
    nextShow: listedShow
      ? {
          slug: listedShow.show.slug,
          title: listedShow.show.title,
          performances: listedShow.performances.map(performance => ({ startsAt: performance.startsAt, availability: performance.availability })),
        }
      : null,
  })
})
