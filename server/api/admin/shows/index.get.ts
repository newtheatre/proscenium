import { z } from 'zod'
import { MAX_SHOW_TITLE, SHOW_STATUSES } from '#shared/utils/programme'

const query = pageQuery.extend({
  status: z.enum(SHOW_STATUSES).optional(),
  search: z.string().trim().max(MAX_SHOW_TITLE).optional(),
})

// Every show, drafts included, with how many performances each has and how many are on sale.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const { page, pageSize, status, search } = await getValidatedQueryOrThrow(event, query)
  const filters = { status, search: search || undefined }

  const total = await countShows(filters)
  const items = await listShows(filters, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
