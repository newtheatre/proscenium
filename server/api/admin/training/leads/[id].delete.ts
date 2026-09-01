import { eq } from 'drizzle-orm'

// Remove a department lead. It takes effect on their next request, because standing is read then
// and held nowhere else (G-110 criterion 4).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'training.leads')
  const id = getRouterParam(event, 'id') ?? ''

  const [held] = await db.select({
    department: schema.departmentLeads.department,
    userId: schema.departmentLeads.userId,
  }).from(schema.departmentLeads).where(eq(schema.departmentLeads.id, id)).limit(1)

  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such lead assignment' })

  await db.batch([
    db.delete(schema.departmentLeads).where(eq(schema.departmentLeads.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'department.lead.removed',
      target: `user:${held.userId}`,
      detail: { department: held.department },
    })),
  ])

  return { ok: true }
})
