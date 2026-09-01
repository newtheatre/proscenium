import { eq } from 'drizzle-orm'
import { moduleForm } from '#shared/utils/training'

// Edit a module. Both the department it is leaving and the one it is joining have to be one the
// editor stewards, or a lead could move a module out of their own reach (G-110 criterion 2).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requireCatalogueAuthority(event)

  const held = await moduleById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such module' })
  assertStewards(resolved, held.department)

  const input = await readValidatedBodyOrThrow(event, moduleForm)
  if (input.department !== held.department) {
    assertStewards(resolved, input.department)
    if (!await departmentByCode(input.department)) {
      throw createError({ statusCode: 404, statusMessage: 'No such department' })
    }
  }

  // Given links replace the lot, which is a smaller change than a diff for a handful of rows.
  // Absent links are left alone, so an edit that never mentions them cannot delete them.
  const replacing = input.materials !== undefined
  await db.batch([
    db.update(schema.trainingModules)
      .set({ ...moduleValues(input), updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(schema.trainingModules.id, id)),
    ...(replacing ? [db.delete(schema.moduleMaterials).where(eq(schema.moduleMaterials.moduleId, id))] : []),
    ...(input.materials ?? []).map((material, index) => db.insert(schema.moduleMaterials).values({
      id: newId(),
      moduleId: id,
      label: material.label,
      url: material.url,
      sort: index,
    })),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'module.updated',
      target: `module:${id}`,
      detail: { department: input.department, status: input.status, expiryMode: input.expiryMode },
    })),
  ])

  return { ok: true }
})
