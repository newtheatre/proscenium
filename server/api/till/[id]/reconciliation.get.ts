import type { H3Event } from 'h3'
import type { AccountRow } from '#server/utils/accounts'

// Guarded like the close it previews (F-102 criterion 4, F-118 criterion 3): a night that has
// ended has no shift left to fall back on, so only the standing officer role reaches back for it.
async function closerFor(event: H3Event, session: { venueId: string, night: string }): Promise<AccountRow> {
  if (session.night === currentShowNight()) {
    return (await requireNightAuthority(event, 'BAR', { venueId: session.venueId })).account
  }

  const resolved = await authority(event)
  if (!resolved.permissions.has('night.till')) {
    throw createError({
      statusCode: 403,
      statusMessage: 'A session from an earlier night needs the bar manager\'s role to close',
    })
  }
  await requireSecondFactorIfPrivileged(event, resolved)
  return resolved.account
}

// The expected figure before anyone commits to closing, so nobody sees a figure they could not
// also act on.
export default defineEventHandler(async (event) => {
  await requireAccount(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Which session' })

  const session = await sessionById(id)
  if (!session) throw createError({ statusCode: 404, statusMessage: 'No such till session' })

  await closerFor(event, session)

  return nightReconciliation(session.night)
})
