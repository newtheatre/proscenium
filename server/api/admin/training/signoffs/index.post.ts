import { expiryFor, expiryProblem, recordedFor, signOffForm } from '#shared/utils/training'
import type { AuditRow } from '#shared/utils/audit'

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
      statusMessage: 'Signing something off as never expiring is the IT Manager\'s to do',
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

  const actorId = resolved.account.id
  const record = {
    id: newId(),
    moduleId: input.moduleId,
    awardedOn: input.awardedOn,
    expiresOn,
    expiryOverridden: input.expiresOn !== undefined,
    source: 'SIGNOFF' as const,
    evidenceRef: input.evidenceRef,
  }
  const entries = (target: string, byAddress: boolean): AuditRow[] => [
    auditEntry({
      actorId,
      action: 'record.signed-off',
      target,
      detail: { module: input.moduleId, awardedOn: input.awardedOn, expiresOn, ...(byAddress ? { byAddress } : {}) },
    }),
    ...(unbounded ? [auditEntry({ actorId, action: 'record.signoff.unbounded', target, detail: { module: input.moduleId } })] : []),
  ]

  // Criterion 1 of G-130: nobody the picker could find, so the account is made in the same batch.
  const newcomer = recordedFor(input)
  const userId = newcomer
    ? await writeRecordByAddress(newcomer, actorId, record, target => entries(target, true))
    : input.userId!
  if (!newcomer) {
    await db.batch([
      db.insert(schema.trainingRecords).values({ ...record, userId, grantedBy: actorId }),
      ...entries(`user:${userId}`, false).map(row => db.insert(schema.auditLog).values(row)),
    ])
  }

  return { ok: true, id: record.id, expiresOn, userId }
})
