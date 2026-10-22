import { ageCheckForm } from '#shared/utils/age-checks'

// Log a Challenge 25 check, standalone from the tonight or door screen (E-118 criteria 1, 2, 4).
export default defineEventHandler(async (event) => {
  // Identity first, so a signed-out caller learns nothing from how the body is refused.
  await requireAccount(event)
  const { venueId, ...input } = await readValidatedBodyOrThrow(event, ageCheckForm)
  const resolved = venueId
    ? await requireNightAuthority(event, 'BAR', { venueId })
    : await requireAnyNightAuthority(event, ['BAR', 'DOOR', 'DUTY_MANAGER'])

  // A refusal on the till belongs to the house a sale there would, never to no house at all (0161).
  const performanceId = input.performanceId ?? (venueId
    ? await performanceForSale({ venueId: resolved.venueId, night: resolved.night, performanceId: null, performanceIds: resolved.performanceIds, event }, Math.floor(Date.now() / 1000))
    : null)

  const id = newId()
  const write = recordAgeCheck(resolved.account.id, { ...input, performanceId }, id)
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'age-check.logged',
    target: `age-check:${id}`,
    detail: { outcome: input.outcome },
  })

  const created = await withAgeCheckConstraints(() => auditedWrite(db.all<{ id: string }>(write.statement), entry))
  if (!created) throw createError({ statusCode: 500, statusMessage: 'That did not save. Try again, and tell the IT Manager if it keeps happening.' })

  return { ok: true, id: write.id }
})
