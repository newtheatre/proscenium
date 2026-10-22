import { supersedeForm } from '#shared/utils/age-checks'

// A correction, never an edit: the entry it corrects stays visible, marked superseded by the
// chain (E-118 criterion 3). Predicated on the write, decided from its own RETURNING (0049).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  await requireAnyNightAuthority(event, ['BAR', 'DOOR', 'DUTY_MANAGER'])
  const input = await readValidatedBodyOrThrow(event, supersedeForm)

  const original = await ageCheckById(id)
  if (!original) throw noSuch('entry')
  // Corrected only by whoever has authority over the entry's own house tonight, and only tonight:
  // another venue's or another night's register is not this shift's to rewrite (0234).
  const { from, to } = showNightBounds(currentShowNight())
  if (original.createdAt < Math.floor(from.getTime() / 1000) || original.createdAt >= Math.floor(to.getTime() / 1000)) {
    throw createError({ statusCode: 403, statusMessage: 'That entry is from another night, and only tonight\'s register is corrected here' })
  }
  const resolved = original.performanceId
    ? await requireAnyNightAuthority(event, ['BAR', 'DOOR', 'DUTY_MANAGER'], { performanceId: original.performanceId })
    : await requireAnyNightAuthority(event, ['BAR', 'DOOR', 'DUTY_MANAGER'])

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
