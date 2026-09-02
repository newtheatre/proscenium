import { eq } from 'drizzle-orm'
import { recalculationStatements } from '#shared/utils/recalculation'
import { recalculationForm } from '#shared/utils/training'

// Restate a module's stamped expiries from its policy. The only retroactive path there is, and
// the only mechanism that may move an `expires_on` at all (G-124).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'training.recalculate')
  const input = await readValidatedBodyOrThrow(event, recalculationForm)

  const module = await moduleById(input.moduleId)
  const policy = await modulePolicy(input.moduleId)
  if (!module || !policy) throw createError({ statusCode: 404, statusMessage: 'No such module' })

  const year = await academicYear(event)
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'record.expiry.recalculated',
    target: `module:${input.moduleId}`,
    detail: {
      module: input.moduleId,
      expiryMode: policy.expiryMode,
      expiryMonths: policy.expiryMonths,
      restated: input.expectedCount,
    },
  })

  // Criterion 5: one batch, the entry first carrying the count guard and the update riding on the
  // entry existing, so no date moves unaudited and no entry stands for a run that did not happen.
  const [guarded, restate] = recalculationStatements({
    moduleId: input.moduleId,
    policy,
    year,
    expectedCount: input.expectedCount,
    entry,
  })
  await db.batch([db.run(guarded!), db.run(restate!)])

  // Criterion 3: the count is recomputed at write time, so the entry's absence is the abort. The
  // figure quoted back is read afterwards, because that is the count that refused the run.
  const [written] = await db.select({ id: schema.auditLog.id }).from(schema.auditLog)
    .where(eq(schema.auditLog.id, entry.id)).limit(1)

  if (!written) {
    const recomputed = await countRestatable(input.moduleId, policy, year)
    throw createError({
      statusCode: 409,
      statusMessage: `You confirmed ${input.expectedCount} records and ${recomputed} now need restating. Preview it again.`,
    })
  }

  return { ok: true, restated: input.expectedCount, entryId: entry.id }
})
