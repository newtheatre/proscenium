import { z } from 'zod'
import { DOOR_SEARCH_MAX, DOOR_SEARCH_MIN, doorTicketFound } from '#shared/utils/door'
import { formatLondon } from '#shared/utils/london'

// The door's one field (issue 1301): tonight's tickets by the booker's name or the reference, in
// door mode's words only, a first name and a count (E-129 criterion 7). Passes: `passes/search`.
const form = z.object({
  q: z.string().trim().min(DOOR_SEARCH_MIN).max(DOOR_SEARCH_MAX),
  performanceId: z.string().trim().min(1),
})

export default defineEventHandler(async (event) => {
  const input = await getValidatedQueryOrThrow(event, form)
  await requireNightAuthority(event, 'DOOR', { performanceId: input.performanceId })

  const found = await doorTicketSearch(input.q, input.performanceId)
  return {
    items: found.map(row => doorTicketFound({
      reference: row.reference,
      holderName: row.holderName,
      partySize: row.partySize,
      status: row.status,
      admittedAt: row.admittedAt === null ? null : formatLondon(new Date(row.admittedAt * 1000), { timeStyle: 'short' }),
    })),
  }
})
