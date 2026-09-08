import { supersedeForm } from '#shared/utils/age-checks'

// A correction, never an edit: the entry it corrects stays visible, marked superseded by the
// chain (E-118 criterion 3). Predicated on the write, decided from its own RETURNING (0049).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requireAnyNightAuthority(event, ['BAR', 'DOOR', 'DUTY_MANAGER'])
  const input = await readValidatedBodyOrThrow(event, supersedeForm)

  const original = await ageCheckById(id)
  if (!original) throw createError({ statusCode: 404, statusMessage: 'No such entry' })

  const correctionId = newId()
  const write = supersedeAgeCheck(resolved.account.id, id, { ...input, performanceId: original.performanceId }, correctionId)
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'age-check.superseded',
    target: `age-check:${id}`,
    detail: { correctionId },
  })

  const corrected = await withAgeCheckConstraints(() => auditedWrite(db.all<{ id: string }>(write.statement), entry))
  if (!corrected) {
    throw createError({ statusCode: 409, statusMessage: 'That entry has already been corrected: correct the correction instead' })
  }

  return { ok: true, id: write.id }
})
