import { eq } from 'drizzle-orm'
import { departmentForm } from '#shared/utils/training'

// Rename a department or retire it. The code is the key modules reference, so it never changes.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'training.write')
  const code = getRouterParam(event, 'code') ?? ''
  const input = await readValidatedBodyOrThrow(event, departmentForm)

  if (!await departmentByCode(code)) {
    throw createError({ statusCode: 404, statusMessage: 'No such department' })
  }

  await db.batch([
    db.update(schema.departments).set({
      name: input.name,
      description: input.description,
      isActive: input.isActive,
      sort: input.sort,
      updatedAt: Math.floor(Date.now() / 1000),
    }).where(eq(schema.departments.code, code)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'department.updated',
      target: `department:${code}`,
      detail: { name: input.name, active: input.isActive },
    })),
  ])

  return { ok: true }
})
