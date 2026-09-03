import { z } from 'zod'
import { MAX_SHOW_TITLE, SHOW_STATUSES } from '#shared/utils/programme'

const query = pageQuery.extend({
  status: z.enum(SHOW_STATUSES).optional(),
  search: z.string().trim().max(MAX_SHOW_TITLE).optional(),
  // What the overview's flag reads: published, and nobody has assessed its warnings (D-102).
  unassessed: yesOrNo.default(false),
})

// Every show, drafts included, with how many performances each has and how many are on sale.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const { page, pageSize, status, search, unassessed } = await getValidatedQueryOrThrow(event, query)
  const filters = { status, search: search || undefined, unassessed }

  const total = await countShows(filters)
  const items = await listShows(filters, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
