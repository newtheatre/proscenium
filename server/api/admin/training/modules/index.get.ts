import { z } from 'zod'
import { MODULE_LIFECYCLE } from '#shared/utils/training'

const query = z.object({
  department: z.string().trim().max(40).optional(),
  status: z.enum(MODULE_LIFECYCLE).optional(),
  // Drafts are invisible to members; the officer writing one has to see it (G-107 criterion 3).
  includeDrafts: yesOrNo.default(true),
  includeRetired: yesOrNo.default(true),
})

// The catalogue, with what each module's policy would stamp on a record awarded today.
export default defineEventHandler(async (event) => {
  const resolved = await requireCatalogueReader(event)
  const input = await getValidatedQueryOrThrow(event, query)

  const items = await listModules(
    { ...input, leadOf: scopeToLeadOf(resolved) },
    await academicYear(event),
    true,
  )
  return { items, total: items.length }
})
