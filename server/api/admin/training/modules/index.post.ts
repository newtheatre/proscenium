import { newModuleForm } from '#shared/utils/training'

// Add a module to the catalogue. The published id is the key, so it cannot be taken twice.
export default defineEventHandler(async (event) => {
  const resolved = await requireCatalogueAuthority(event)
  const input = await readValidatedBodyOrThrow(event, newModuleForm)
  assertStewards(resolved, input.department)

  if (!await departmentByCode(input.department)) {
    throw createError({ statusCode: 404, statusMessage: 'No such department' })
  }
  if (await moduleById(input.id)) {
    throw createError({ statusCode: 409, statusMessage: 'A module already has that id' })
  }

  await db.batch([
    db.insert(schema.trainingModules).values({ id: input.id, ...moduleValues(input) }),
    ...(input.materials ?? []).map((material, index) => db.insert(schema.moduleMaterials).values({
      id: newId(),
      moduleId: input.id,
      label: material.label,
      url: material.url,
      sort: index,
    })),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'module.created',
      target: `module:${input.id}`,
      detail: { department: input.department, kind: input.kind, safetyCritical: input.safetyCritical },
    })),
  ])

  return { ok: true, id: input.id }
})
