import { changes } from '#shared/utils/audit'
import { milestoneTypeForm } from '#shared/utils/backstage'

// Edit a milestone type's label or order.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'board.write')
  const { label, sort } = await readValidatedBodyOrThrow(event, milestoneTypeForm)

  const before = (await milestoneTypes(true)).find(type => type.id === id)
  if (!before) throw createError({ statusCode: 404, statusMessage: 'No such milestone type' })

  await db.batch([
    db.run(updateMilestoneTypeStatement(id, label, sort, resolved.account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'backstage-milestone-type.updated',
      target: `backstage-milestone-type:${id}`,
      detail: changes({ label: [before.label, label] }),
    })),
  ])

  return { ok: true }
})
