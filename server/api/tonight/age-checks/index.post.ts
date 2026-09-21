import { ageCheckForm } from '#shared/utils/age-checks'

// Log a Challenge 25 check, standalone from the tonight or door screen (E-118 criteria 1, 2, 4).
export default defineEventHandler(async (event) => {
  const resolved = await requireAnyNightAuthority(event, ['BAR', 'DOOR', 'DUTY_MANAGER'])
  const input = await readValidatedBodyOrThrow(event, ageCheckForm)

  const id = newId()
  const write = recordAgeCheck(resolved.account.id, input, id)
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
