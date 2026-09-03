import { z } from 'zod'
import { MAX_BAR_NAME } from '#shared/utils/bar'

const query = pageQuery.extend({
  // A retired product is still what a historical line was sold as, so the console shows it by
  // default and the till is what leaves it out (F-111 criterion 3).
  includeRetired: yesOrNo.default(true),
  categoryId: z.string().trim().min(1).optional(),
  search: z.string().trim().max(MAX_BAR_NAME).optional(),
})

// Every product, in the order the till lays them out, with whether each has ever been sold.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const { page, pageSize, includeRetired, categoryId, search } = await getValidatedQueryOrThrow(event, query)
  const filters = { includeRetired, categoryId: categoryId || undefined, search: search || undefined }

  const total = await countProducts(filters)
  const items = await listProducts(filters, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
