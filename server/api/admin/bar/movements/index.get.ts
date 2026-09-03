import { z } from 'zod'
import { MAX_BAR_NAME, STOCK_MOVEMENT_KINDS } from '#shared/utils/bar'

const query = pageQuery.extend({
  itemId: z.string().trim().min(1).optional(),
  kind: z.enum(STOCK_MOVEMENT_KINDS).optional(),
  search: z.string().trim().max(MAX_BAR_NAME).optional(),
})

// The movement history, newest first: what every on-hand figure is the sum of.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const { page, pageSize, itemId, kind, search } = await getValidatedQueryOrThrow(event, query)
  const filters = { itemId: itemId || undefined, kind, search: search || undefined }

  const total = await countMovements(filters)
  const items = await listMovements(filters, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
