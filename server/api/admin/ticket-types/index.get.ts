import { z } from 'zod'
import { MAX_TICKET_TYPE_NAME } from '#shared/utils/ticket-types'

const query = pageQuery.extend({
  // An archived type is still the type a historical ticket was sold under, so the console shows
  // it by default and the sales paths are what leave it out (D-119 criterion 2).
  includeArchived: yesOrNo.default(true),
  search: z.string().trim().max(MAX_TICKET_TYPE_NAME).optional(),
})

// Every ticket type, with whether each has ever been sold.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const { page, pageSize, includeArchived, search } = await getValidatedQueryOrThrow(event, query)
  const filters = { includeArchived, search: search || undefined }

  const total = await countTicketTypes(filters)
  const items = await listTicketTypes(filters, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
