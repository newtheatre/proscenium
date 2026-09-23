import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import { lackingNewPrerequisites, sessionModulesPreviewQuery } from '#shared/utils/training'
import type { PrerequisiteNeed } from '#shared/utils/training'

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

  const current = (await db.select({ moduleId: schema.sessionModules.moduleId })
    .from(schema.sessionModules)
    .where(eq(schema.sessionModules.sessionId, id))).map(row => row.moduleId)

  // A brief gates nothing, so it is dropped here exactly as sign-up drops it (G-102 c2).
  const edges = await prerequisitesOf([...new Set([...current, ...input.moduleIds])])
  const needs = (moduleIds: string[]): PrerequisiteNeed[] => moduleIds.flatMap(moduleId =>
    (edges.get(moduleId) ?? []).filter(edge => edge.requiresKind !== 'BRIEF'))

  const listed = and(
    eq(schema.sessionAttendees.sessionId, id),
    ne(schema.sessionAttendees.status, 'CANCELLED'),
  )
  const members = await db.select({ userId: schema.sessionAttendees.userId, name: schema.users.name })
    .from(schema.sessionAttendees)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessionAttendees.userId))
    .where(listed)
    .orderBy(asc(schema.sessionAttendees.signedUpAt), asc(schema.sessionAttendees.createdAt))

  // Scoped by the list as a subquery, so a full room binds no more than an empty one (0003).
  const records = await db.select({ userId: schema.trainingRecords.userId, moduleId: schema.trainingRecords.moduleId })
    .from(schema.trainingRecords)
    .where(and(
      inArray(schema.trainingRecords.userId, db.select({ userId: schema.sessionAttendees.userId })
        .from(schema.sessionAttendees).where(listed)),
      heldNow(today),
    ))

  const lacking = lackingNewPrerequisites(
    needs(current),
    needs(input.moduleIds),
    members.map(member => ({
      ...member,
      held: new Set(records.filter(record => record.userId === member.userId).map(record => record.moduleId)),
    })),
  )

  return { lacking }
})
