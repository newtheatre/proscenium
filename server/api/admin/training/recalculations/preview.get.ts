import { z } from 'zod'
import { describeExpiry } from '#shared/utils/training'

const query = z.object({
  moduleId: z.string().trim().min(1).max(32),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
})

// What a recalculation would restate, before anything is written (G-124 criterion 2).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'training.recalculate')
  const input = await getValidatedQueryOrThrow(event, query)

  const module = await moduleById(input.moduleId)
  const policy = await modulePolicy(input.moduleId)
  if (!module || !policy) throw createError({ statusCode: 404, statusMessage: 'No such module' })

  const year = await academicYear(event)

  return {
    module: { id: module.id, name: module.name, department: module.department, kind: module.kind },
    policy: { expiryMode: policy.expiryMode, expiryMonths: policy.expiryMonths },
    describes: describeExpiry(policy),
    items: await previewRestatable(input.moduleId, policy, year, input.limit, input.offset),
    total: await countRestatable(input.moduleId, policy, year),
    limit: input.limit,
    offset: input.offset,
  }
})
