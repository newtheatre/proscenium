import { nominalMappingForm } from '#shared/utils/su-export'

// Changes what a (kind, source) pair maps to; the treasurer's own write, audited with the
// from and to values (J-104 criterion 5).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'finance.write')
  const input = await readValidatedBodyOrThrow(event, nominalMappingForm)

  const applied = await setNominalMapping(input, resolved.account.id)
  if (!applied) throw createError({ statusCode: 404, statusMessage: 'No such kind and source pair' })
  return { ok: true }
})
