import { milestoneTypeForm } from '#shared/utils/backstage'

// Add a milestone type. Nothing already sent moves: a message snapshots the label at send
// time, so editing or retiring one later changes nothing already on the board (E-121 criterion 1).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'board.write')
  const { label, sort } = await readValidatedBodyOrThrow(event, milestoneTypeForm)

  const id = newId()
  await db.batch([
    db.run(insertMilestoneTypeStatement(label, sort, resolved.account.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'backstage-milestone-type.created',
      target: `backstage-milestone-type:${id}`,
      detail: { label },
    })),
  ])

  return { ok: true, id }
})
