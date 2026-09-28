import { currentShowNight, showNightBounds } from '#shared/utils/show-night'
import type { H3Event } from 'h3'
import type { FirstAider } from '#shared/utils/venue-emergency'
import type { OnCall, VenueTonight } from '#server/utils/tonight'

// Every venue running tonight, to anyone signed in, cached on the device by any show-night screen
// (E-113 criteria 2, 4 as amended by issue 1310). The building's card is whoever holds the phone's.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const { from, to } = showNightBounds(currentShowNight())
  const [start, end] = [Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000)]
  const firstAidModule = await configValueIfSet(event, 'FIRST_AID_MODULE')

  const venues = await venuesTonight(start, end)
  const cards = await Promise.all(venues.map(venue => cardTonight(event, venue, start, end, firstAidModule)))
  // The venues the caller works tonight lead, so a two-venue night opens on their own building;
  // `viewerId` stamps whose numbers these are, for the copy the phone keeps (A-114).
  return {
    viewerId: account.id,
    cards: cards.sort((a, b) => Number(b.dutyManagers !== null) - Number(a.dutyManagers !== null)),
  }
})

async function cardTonight(event: H3Event, venue: VenueTonight, from: number, to: number, firstAidModule: string | null) {
  const [card, dutyManagers, derived] = await Promise.all([
    currentCard(venue.venueId),
    onCallFor(event, venue.venueId),
    firstAidModule === null ? null : firstAidersTonight(venue.venueId, from, to, firstAidModule, londonToday()),
  ])
  return {
    venueId: venue.venueId,
    venueName: venue.venueName,
    address: card?.address ?? null,
    assemblyPoint: card?.assemblyPoint ?? null,
    exits: card?.exits ?? null,
    isolationPoints: card?.isolationPoints ?? null,
    firstAidKit: card?.firstAidKit ?? null,
    defibrillator: card?.defibrillator ?? null,
    firstAiders: card?.firstAiders ?? null,
    firePanel: card?.firePanel ?? null,
    what3words: card?.what3words ?? null,
    notes: card?.notes ?? null,
    firstCallName: card?.firstCallName ?? null,
    firstCallPhone: card?.firstCallPhone ?? null,
    updatedAt: card?.updatedAt ?? null,
    firstAidersTonight: derived satisfies FirstAider[] | null,
    dutyManagers,
  }
}

// The duty manager's number stays with tonight's own team at the venue and their consent (A-114,
// 0009); null tells the screen the caller is not on it, which is not the same as nobody sharing.
async function onCallFor(event: H3Event, venueId: string): Promise<OnCall[] | null> {
  const resolved = await nightAuthorityIfAny(event, ['DUTY_MANAGER', 'DOOR', 'BAR'], { venueId })
  if (!resolved) return null
  const teams = await Promise.all(resolved.performanceIds.map(performanceId => tonightTeam(performanceId)))
  return dutyManagersOnCall(teams.flat())
}
