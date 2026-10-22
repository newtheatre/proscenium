import { eq } from 'drizzle-orm'
import { sessionModulesPreviewQuery } from '#shared/utils/training'

// Who signed up would lack a prerequisite a proposed change of modules adds, read before saving.
// A warning, never a refusal: the refusals are the ones the change itself makes (G-115 c7).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Say which session you mean' })

  const resolved = await requireTrainer(event)
  const input = await getValidatedQueryOrThrow(event, sessionModulesPreviewQuery)

  const [session] = await db.select({ trainerId: schema.trainingSessions.trainerId })
    .from(schema.trainingSessions)
    .where(eq(schema.trainingSessions.id, id))
    .limit(1)

  if (!session) throw noSuch('session', 'Open the sessions list and choose it again')
  if (session.trainerId !== resolved.account.id && !resolved.permissions.has('training.write')) {
    throw createError({ statusCode: 403, statusMessage: 'Only the trainer running this session may change it' })
  }

  const today = londonToday()
  await assertTeachable(resolved, input.moduleIds, today)

  const lacking = await lackingFor(id, input.moduleIds, today)

  return { lacking }
})
