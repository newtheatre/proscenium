import { externalCertificateForm, externalExpiryProblem, recordedFor } from '#shared/utils/training'
import type { AuditRow } from '#shared/utils/audit'

// Record a certificate somebody earned elsewhere, against a module that accepts them (G-121).
// Everything a sign-off refuses, this refuses too; what it adds is that we assessed nothing.
export default defineEventHandler(async (event) => {
  const resolved = await requireCatalogueAuthority(event)
  const input = await readValidatedBodyOrThrow(event, externalCertificateForm)

  // Criterion 5. The same department scope, award date and prerequisite rules as a sign-off.
  const policy = await assertAwardable(resolved, input, {
    retired: 'A retired module takes no new external certificates',
    brief: 'A brief is attended, not evidenced by an external certificate',
  })

  // Criterion 1. Accepting outside evidence is the module's own choice, made in the catalogue.
  if (!policy.allowsExternal) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This module does not accept external certificates',
    })
  }

  // Criterion 3. Always an override, so it never inherits the module's policy and G-124 skips it.
  const problem = externalExpiryProblem(input.awardedOn, input.expiresOn)
  if (problem) throw createError({ statusCode: 422, statusMessage: problem })

  const actorId = resolved.account.id
  const record = {
    id: newId(),
    moduleId: input.moduleId,
    awardedOn: input.awardedOn,
    expiresOn: input.expiresOn,
    expiryOverridden: true,
    source: 'EXTERNAL' as const,
    evidenceRef: input.evidenceRef,
  }
  // The reference is a thing written about them, so it stays off the trail (0011).
  const entry = (target: string, byAddress: boolean): AuditRow => auditEntry({
    actorId,
    action: 'record.external-certificate',
    target,
    detail: { module: input.moduleId, awardedOn: input.awardedOn, expiresOn: input.expiresOn, ...(byAddress ? { byAddress } : {}) },
  })

  // Nobody the picker could find, so the account is made in the same batch (G-130, 0091).
  const newcomer = recordedFor(input)
  const userId = newcomer
    ? await writeRecordByAddress(newcomer, actorId, record, target => [entry(target, true)])
    : input.userId!
  if (!newcomer) {
    await db.batch([
      db.insert(schema.trainingRecords).values({ ...record, userId, grantedBy: actorId }),
      db.insert(schema.auditLog).values(entry(`user:${userId}`, false)),
    ])
  }

  return { ok: true, id: record.id, expiresOn: input.expiresOn, userId }
})
