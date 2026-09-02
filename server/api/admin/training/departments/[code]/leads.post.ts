import { and, eq } from 'drizzle-orm'
import { defaultRoleExpiry } from '#shared/utils/roles'
import { leadForm } from '#shared/utils/training'

// Assign a department lead. Expiry follows the committee year, so stewardship lapses at handover
// unless somebody renews it (G-110 criterion 3).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'training.leads')
  const code = getRouterParam(event, 'code') ?? ''
  const input = await readValidatedBodyOrThrow(event, leadForm)

  if (!await departmentByCode(code)) {
    throw createError({ statusCode: 404, statusMessage: 'No such department' })
  }

  const account = await findById(input.userId)
  if (!account) throw createError({ statusCode: 404, statusMessage: 'No such account' })
  if (account.anonymisedAt !== null) {
    throw createError({ statusCode: 409, statusMessage: 'That account has been erased' })
  }

  const [held] = await db.select({ id: schema.departmentLeads.id }).from(schema.departmentLeads)
    .where(and(eq(schema.departmentLeads.department, code), eq(schema.departmentLeads.userId, input.userId)))
    .limit(1)

  // Undefined takes the next handover; an explicit null is a deliberate permanent assignment.
  const expiresAt = input.expiresAt === undefined ? defaultRoleExpiry(new Date()) : input.expiresAt
  const id = held?.id ?? newId()

  await db.batch([
    held
      ? db.update(schema.departmentLeads).set({ expiresAt, grantedBy: resolved.account.id })
          .where(eq(schema.departmentLeads.id, held.id))
      : db.insert(schema.departmentLeads).values({
          id,
          department: code,
          userId: input.userId,
          expiresAt,
          grantedBy: resolved.account.id,
        }),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'department.lead.assigned',
      target: `user:${input.userId}`,
      detail: { department: code, expiresAt },
    })),
  ])

  return { ok: true, id }
})
