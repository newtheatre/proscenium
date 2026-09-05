import { z } from 'zod'
import { ACCESS_PROFILE_STATUSES } from '#shared/utils/access-profiles'

const query = pageQuery.extend({
  status: z.enum(ACCESS_PROFILE_STATUSES).optional(),
  search: z.string().trim().max(200).optional(),
})

// Every access profile declaration, without the encrypted payload: the accessibility officer
// opens one to read it (D-127 criterion 2).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'access.verify')
  const { page, pageSize, status, search } = await getValidatedQueryOrThrow(event, query)

  const total = await countAccessProfiles(status, search)
  const items = await listAccessProfiles(status, search, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
