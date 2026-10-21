import { z } from 'zod'
import { currentShowNight, isShowNight } from '#shared/utils/show-night'

const query = z.object({ night: z.string().refine(isShowNight, 'Not a valid night').optional() })

// A night's performances, with the nearest night either side that has one (criterion 1): null where
// nothing is on in that direction at all.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const { night } = await getValidatedQueryOrThrow(event, query)
  const on = night ?? currentShowNight()
  const { previousNight, nextNight } = await neighbouringNights(on)

  return {
    night: on,
    tonight: currentShowNight(),
    previousNight,
    nextNight,
    performances: await performancesForNight(on),
  }
})
