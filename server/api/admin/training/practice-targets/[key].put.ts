import { eq, inArray } from 'drizzle-orm'
import { practiceTargetForm } from '#shared/utils/training'

// Change a practice target. Everything but the key, which consumers reference and which is
// therefore immutable once created (G-126 criterion 1).
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key')
  if (!key) throw createError({ statusCode: 400, statusMessage: 'No target named' })

  const resolved = await requirePermission(event, 'training.write')
  const input = await readValidatedBodyOrThrow(event, practiceTargetForm)

  const [held] = await db.select({ key: schema.practiceTargets.key })
    .from(schema.practiceTargets)
    .where(eq(schema.practiceTargets.key, key))
    .limit(1)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such practice target' })

  if (input.moduleIds.length > 0) {
    const found = await db.select({ id: schema.trainingModules.id })
      .from(schema.trainingModules)
      .where(inArray(schema.trainingModules.id, input.moduleIds))
    const missing = input.moduleIds.filter(id => !found.some(row => row.id === id))
    if (missing.length > 0) {
      throw createError({ statusCode: 404, statusMessage: `No such module: ${missing.join(', ')}` })
    }
  }

  await db.batch([
    db.update(schema.practiceTargets).set({
      name: input.name,
      description: input.description,
      windowHours: input.windowHours,
      isActive: input.isActive,
      updatedAt: Math.floor(Date.now() / 1000),
    }).where(eq(schema.practiceTargets.key, key)),
    db.delete(schema.practiceTargetModules).where(eq(schema.practiceTargetModules.targetKey, key)),
    ...input.moduleIds.map(moduleId => db.insert(schema.practiceTargetModules).values({
      id: newId(),
      targetKey: key,
      moduleId,
    })),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'practice.target.updated',
      target: `practice:${key}`,
      detail: { modules: input.moduleIds, windowHours: input.windowHours, isActive: input.isActive },
    })),
  ])

  return { ok: true }
})
