import { newDepartmentForm } from '#shared/utils/training'

// Add a department to the vocabulary modules and sign-offs are scoped by.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'training.write')
  const input = await readValidatedBodyOrThrow(event, newDepartmentForm)

  if (await departmentByCode(input.code)) {
    throw createError({ statusCode: 409, statusMessage: 'A department already has that code' })
  }

  await db.batch([
    db.insert(schema.departments).values({
      code: input.code,
      name: input.name,
      description: input.description,
      isActive: input.isActive,
      sort: input.sort,
    }),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'department.created',
      target: `department:${input.code}`,
      detail: { name: input.name },
    })),
  ])

  return { ok: true, code: input.code }
})
