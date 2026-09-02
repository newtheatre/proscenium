import { expiryFor, expiryProblem, signOffForm } from '#shared/utils/training'

// Sign off a module for somebody: competence proven outside a session, on the department's terms.
// The first thing in the system that awards a record, and it awards exactly one (G-120).
export default defineEventHandler(async (event) => {
  const resolved = await requireCatalogueAuthority(event)
  const input = await readValidatedBodyOrThrow(event, signOffForm)

  // Criteria 1 to 3: the department is the actor's, the module takes a sign-off, the award is not
  // in the future, and every direct prerequisite is currently held.
  const policy = await assertAwardable(resolved, input, {
    retired: 'A retired module takes no new sign-offs',
    brief: 'A brief is attended, not signed off',
  })

  // Criterion 5. Never is break-glass: an explicit null expiry needs a permission the screen does
  // not offer, and its use is audited under its own action.
  const unbounded = input.expiresOn === null
  if (unbounded && !resolved.permissions.has('training.override')) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Signing something off as never expiring is an administrator\'s to do',
    })
  }

  // Criterion 4. An explicit expiry has to fit the module's policy and the catalogue-wide cap.
  if (typeof input.expiresOn === 'string') {
    const problem = expiryProblem(policy, input.awardedOn, input.expiresOn)
    if (problem) throw createError({ statusCode: 422, statusMessage: problem })
  }

  // Stamped at award from the policy as at that date, and never recomputed afterwards (G-123 c3).
  const expiresOn = input.expiresOn === undefined
    ? expiryFor(policy, input.awardedOn, await academicYear(event))
    : input.expiresOn

  const id = newId()
  await db.batch([
    db.insert(schema.trainingRecords).values({
      id,
      userId: input.userId,
      moduleId: input.moduleId,
      awardedOn: input.awardedOn,
      expiresOn,
      expiryOverridden: input.expiresOn !== undefined,
      source: 'SIGNOFF',
      grantedBy: resolved.account.id,
      evidenceRef: input.evidenceRef,
    }),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'record.signed-off',
      target: `user:${input.userId}`,
      detail: { module: input.moduleId, awardedOn: input.awardedOn, expiresOn },
    })),
    ...(unbounded
      ? [db.insert(schema.auditLog).values(auditEntry({
          actorId: resolved.account.id,
          action: 'record.signoff.unbounded',
          target: `user:${input.userId}`,
          detail: { module: input.moduleId },
        }))]
      : []),
  ])

  return { ok: true, id, expiresOn }
})
