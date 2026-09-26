import { z } from 'zod'
import { doorTicketFound, fitsDoorLookUp } from '#shared/utils/door'

// The door's one field (issue 1301): tonight's tickets by the booker's name or the reference, in
// door mode's words only, a first name and a count (E-129 criterion 7). Passes: `passes/search`.
const form = z.object({
  q: z.string().trim().refine(fitsDoorLookUp, 'Type a name or a reference that fits the lookup'),
  performanceId: z.string().trim().min(1),
})

export default defineEventHandler(async (event) => {
  const input = await getValidatedQueryOrThrow(event, form)
  await requireNightAuthority(event, 'DOOR', { performanceId: input.performanceId })

  const found = await doorTicketSearch(input.q, input.performanceId)
  return { items: found.map(doorTicketFound) }
})
