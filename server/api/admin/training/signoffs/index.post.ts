import { expiryFor, expiryProblem, signOffForm } from '#shared/utils/training'

// Sign off a module for somebody: competence proven outside a session, on the department's terms.
// The first thing in the system that awards a record, and it awards exactly one (G-120).
export default defineEventHandler(async (event) => {
  const resolved = await requireCatalogueAuthority(event)
  const input = await readValidatedBodyOrThrow(event, signOffForm)

  const module = await moduleById(input.moduleId)
  if (!module) throw createError({ statusCode: 404, statusMessage: 'No such module' })

  // Criterion 1. A lead of another department is refused; the training officer bypasses the scope.
  assertStewards(resolved, module.department)

  const account = await findById(input.userId)
  if (!account) throw createError({ statusCode: 404, statusMessage: 'No such account' })
  if (account.anonymisedAt !== null) {
    throw createError({ statusCode: 409, statusMessage: 'That account has been erased' })
  }

  const policy = await modulePolicy(input.moduleId)
  if (!policy) throw createError({ statusCode: 404, statusMessage: 'No such module' })
  if (policy.status === 'RETIRED') {
    throw createError({ statusCode: 409, statusMessage: 'A retired module takes no new sign-offs' })
  }
  if (policy.kind === 'BRIEF') {
    throw createError({ statusCode: 409, statusMessage: 'A brief is attended, not signed off' })
  }

  // Criterion 3. A future award would read as valid to every gate between now and then.
  const today = londonToday()
  if (input.awardedOn > today) {
    throw createError({ statusCode: 422, statusMessage: 'An award cannot be dated in the future' })
  }

  // Criterion 2: every direct prerequisite held, expiring included, and the refusal names the gaps.
  // No acknowledgement path exists for any kind, which the criterion demands of a certification.
  const needed = (await prerequisitesOf([input.moduleId])).get(input.moduleId) ?? []
  const held = await modulesHeldBy(input.userId, today)
  const gaps = needed.filter(edge => !held.has(edge.requiresId))
  if (gaps.length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `Not held yet: ${gaps.map(gap => `${gap.requiresId} ${gap.requiresName}`).join(', ')}`,
    })
  }

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
