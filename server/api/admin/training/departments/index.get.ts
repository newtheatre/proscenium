import { z } from 'zod'

const query = z.object({
  includeInactive: yesOrNo.default(false),
})

// The department vocabulary, each with the people currently leading it.
export default defineEventHandler(async (event) => {
  const resolved = await requireCatalogueReader(event)
  const input = await getValidatedQueryOrThrow(event, query)

  const items = await listDepartments(input.includeInactive, scopeToLeadOf(resolved))
  return { items, total: items.length }
})
