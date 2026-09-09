import { z } from 'zod'

const query = z.object({ q: z.string().trim().min(1).max(200) })

// K-123 criterion 1: a buyer is chosen, never typed as an id.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.write')
  const input = await getValidatedQueryOrThrow(event, query)
  return { items: await passBuyers(input.q) }
})
