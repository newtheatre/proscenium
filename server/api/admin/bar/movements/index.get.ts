import { z } from 'zod'
import { STOCK_MOVEMENT_KINDS } from '#shared/utils/bar'

const query = pageQuery.extend({
  itemId: z.string().trim().min(1).optional(),
  kind: z.enum(STOCK_MOVEMENT_KINDS).optional(),
})

// The movement history, newest first: what every on-hand figure is the sum of.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const { page, pageSize, itemId, kind } = await getValidatedQueryOrThrow(event, query)
  const filters = { itemId: itemId || undefined, kind }

  const total = await countMovements(filters)
  const items = await listMovements(filters, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
