import { eq } from 'drizzle-orm'

// Withdraw a prerequisite. The edge is the whole of what is removed: nothing about the records
// already earned under it changes, because a record is what happened (G-108).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requireCatalogueAuthority(event)

  const [edge] = await db.select({
    moduleId: schema.modulePrerequisites.moduleId,
    requiresId: schema.modulePrerequisites.requiresId,
    department: schema.trainingModules.department,
  })
    .from(schema.modulePrerequisites)
    .innerJoin(schema.trainingModules, eq(schema.trainingModules.id, schema.modulePrerequisites.moduleId))
    .where(eq(schema.modulePrerequisites.id, id))
    .limit(1)

  if (!edge) throw createError({ statusCode: 404, statusMessage: 'No such prerequisite' })
  assertStewards(resolved, edge.department)

  await db.batch([
    db.delete(schema.modulePrerequisites).where(eq(schema.modulePrerequisites.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'prerequisite.removed',
      target: `module:${edge.moduleId}`,
      detail: { requires: edge.requiresId },
    })),
  ])

  return { ok: true }
})
