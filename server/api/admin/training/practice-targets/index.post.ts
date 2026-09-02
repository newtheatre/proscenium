import { eq, inArray } from 'drizzle-orm'
import { newPracticeTargetForm } from '#shared/utils/training'

// Create a practice target. The key is immutable from here on, because consumers reference it.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'training.write')
  const input = await readValidatedBodyOrThrow(event, newPracticeTargetForm)

  const held = await db.select({ key: schema.practiceTargets.key })
    .from(schema.practiceTargets)
    .where(eq(schema.practiceTargets.key, input.key))
    .limit(1)
  if (held.length > 0) {
    throw createError({ statusCode: 409, statusMessage: `${input.key} is already a practice target` })
  }

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
    db.insert(schema.practiceTargets).values({
      key: input.key,
      name: input.name,
      description: input.description,
      windowHours: input.windowHours,
      isActive: input.isActive,
    }),
    ...input.moduleIds.map(moduleId => db.insert(schema.practiceTargetModules).values({
      id: newId(),
      targetKey: input.key,
      moduleId,
    })),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'practice.target.created',
      target: `practice:${input.key}`,
      detail: { modules: input.moduleIds, windowHours: input.windowHours },
    })),
  ])

  return { ok: true, key: input.key }
})
