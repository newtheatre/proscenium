import { z } from 'zod'
import { MAX_WARNING_TITLE } from '#shared/utils/content-warnings'

const query = pageQuery.extend({
  // An archived entry is still the warning a published show carries, so the console shows it by
  // default and the show write path is what refuses a new use of one.
  includeArchived: yesOrNo.default(true),
  search: z.string().trim().max(MAX_WARNING_TITLE).optional(),
})

// The warning vocabulary. Each row says how many shows carry it, so an entry in use can be seen
// to be in use before anybody tries to delete it (D-102 criterion 1).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const { page, pageSize, includeArchived, search } = await getValidatedQueryOrThrow(event, query)
  const filters = { includeArchived, search: search || undefined }

  const total = await countContentWarnings(filters)
  const items = await listContentWarnings(filters, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
