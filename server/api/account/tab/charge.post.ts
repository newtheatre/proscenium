import { londonDayOf } from '#shared/utils/ledger'
import { SELF_TAB_RESTRICTED, selfTabForm } from '#shared/utils/self-tab'

// A holder adds to their own tab with nobody on the till: the same sale, cap and stock as the
// till's, with the holder as both actor and debtor (F-108 criterion 7, 0165).
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, selfTabForm)
  const account = await requireAccount(event)
  await requireOwnTabHolder(event, account.id)
  const night = currentShowNight()
  const session = await openSessionFor(input.venueId, night)
  if (!session) throw createError({ statusCode: 409, statusMessage: 'That bar\'s till is not open tonight, so nothing can be added to a tab there' })
  const performanceIds = (await performancesOnNight(night, input.venueId)).filter(one => one.status !== 'CANCELLED').map(one => one.id)

  try {
    const committed = await commitSale(
      input.lines.map(line => ({ ...line, choiceItemId: null })), londonDayOf(new Date()), input.expectedTotalPence, null, null, account.id,
      { actorId: account.id, sessionId: session.id, venueId: input.venueId, night, performanceId: null, performanceIds },
    )
    return { ok: true, ...committed }
  }
  catch (error) {
    // The till would ask Challenge 25 here; nobody is there to ask it, so the bar serves it.
    const restricted = (error as { data?: { ageCheckFor?: string[] } }).data?.ageCheckFor
    if (restricted) throw createError({ statusCode: 409, statusMessage: `${restricted.join(' and ')} ${SELF_TAB_RESTRICTED}. Nothing has been added.` })
    throw error
  }
})
