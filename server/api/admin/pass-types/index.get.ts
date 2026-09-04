import { z } from 'zod'
import { MAX_PASS_TYPE_NAME, PASS_TYPE_STATUSES } from '#shared/utils/pass-types'

const query = pageQuery.extend({
  status: z.enum(PASS_TYPE_STATUSES).optional(),
  search: z.string().trim().max(MAX_PASS_TYPE_NAME).optional(),
})

// Every pass product, with whether each has ever been issued.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const { page, pageSize, status, search } = await getValidatedQueryOrThrow(event, query)
  const filters = { status, search: search || undefined }

  const total = await countPassTypes(filters)
  const items = await listPassTypes(filters, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
