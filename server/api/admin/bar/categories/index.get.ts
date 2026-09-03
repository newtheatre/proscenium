import { z } from 'zod'
import { MAX_BAR_NAME } from '#shared/utils/bar'

const query = pageQuery.extend({
  search: z.string().trim().max(MAX_BAR_NAME).optional(),
})

// The till's categories, in the order they appear on it.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const { page, pageSize, search } = await getValidatedQueryOrThrow(event, query)
  const filters = { search: search || undefined }

  const total = await countCategories(filters)
  const items = await listCategories(filters, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
