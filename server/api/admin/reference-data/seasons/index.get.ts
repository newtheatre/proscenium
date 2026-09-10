import { z } from 'zod'
import { MAX_SEASON_NAME } from '#shared/utils/seasons'

const query = pageQuery.extend({
  includeArchived: yesOrNo.default(true),
  search: z.string().trim().max(MAX_SEASON_NAME).optional(),
})

// Every season, with whether a show belongs to it.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const { page, pageSize, includeArchived, search } = await getValidatedQueryOrThrow(event, query)
  const filters = { includeArchived, search: search || undefined }

  const total = await countSeasonsAdmin(filters)
  const items = await listSeasonsAdmin(filters, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
