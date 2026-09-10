import { z } from 'zod'
import { liveAdmins } from '#server/utils/health'

const body = z.object({
  path: z.string().trim().min(1).max(200),
})

// Documentation drift is a defect, not a chore (J-109 criterion 4): whoever reads a stale page
// tells the IT Manager, recorded in the trail and delivered like any other transactional notice.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const input = await readValidatedBodyOrThrow(event, body)

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'docs.drift-reported',
    target: `docs:${input.path}`,
    detail: { path: input.path },
  }))

  const admins = await liveAdmins()
  await Promise.all(admins.map(admin => notify(event, {
    userId: admin.id,
    type: 'docs.drift-reported',
    context: { name: '', path: input.path, reportedByName: account.name },
  })))

  return { ok: true }
})
