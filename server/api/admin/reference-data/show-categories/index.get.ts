import { z } from 'zod'
import { MAX_CATEGORY_NAME } from '#shared/utils/show-categories'

const query = pageQuery.extend({
  includeArchived: yesOrNo.default(true),
  search: z.string().trim().max(MAX_CATEGORY_NAME).optional(),
})

// Every show category, with whether a show belongs to it.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const { page, pageSize, includeArchived, search } = await getValidatedQueryOrThrow(event, query)
  const filters = { includeArchived, search: search || undefined }

  const total = await countShowCategoriesAdmin(filters)
  const items = await listShowCategoriesAdmin(filters, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
