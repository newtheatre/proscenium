import { z } from 'zod'
import { MAX_BAR_NAME } from '#shared/utils/bar'

const query = pageQuery.extend({
  includeRetired: yesOrNo.default(true),
  search: z.string().trim().max(MAX_BAR_NAME).optional(),
})

// Every stocked item, each with what is on hand: the sum of its movements, computed here.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const { page, pageSize, includeRetired, search } = await getValidatedQueryOrThrow(event, query)
  const filters = { includeRetired, search: search || undefined }

  const total = await countItems(filters)
  const items = await listItems(filters, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
