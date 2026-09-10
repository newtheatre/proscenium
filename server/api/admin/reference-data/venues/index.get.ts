import { z } from 'zod'
import { MAX_VENUE_NAME } from '#shared/utils/venues'

const query = pageQuery.extend({
  // A retired venue still names the performances it already hosted, so the console shows it by
  // default and the booking paths are what leave it out (D-131 criterion 5).
  includeArchived: yesOrNo.default(true),
  search: z.string().trim().max(MAX_VENUE_NAME).optional(),
})

// Every venue, with whether it is in use.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const { page, pageSize, includeArchived, search } = await getValidatedQueryOrThrow(event, query)
  const filters = { includeArchived, search: search || undefined }

  const total = await countVenuesAdmin(filters)
  const items = await listVenuesAdmin(filters, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
