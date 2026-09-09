import { z } from 'zod'

const body = z.object({ active: z.boolean() })

// Retire or reinstate a milestone type. Never deleted: a message already posted keeps naming
// it, so a night's history never loses what it recorded.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'board.write')
  const { active } = await readValidatedBodyOrThrow(event, body)

  const before = (await milestoneTypes(true)).find(type => type.id === id)
  if (!before) throw createError({ statusCode: 404, statusMessage: 'No such milestone type' })

  await db.batch([
    db.run(retireMilestoneTypeStatement(id, active, resolved.account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: active ? 'backstage-milestone-type.reinstated' : 'backstage-milestone-type.retired',
      target: `backstage-milestone-type:${id}`,
    })),
  ])

  return { ok: true }
})
