import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import { lackingNewPrerequisites, saysGaps } from '#shared/utils/training'
import { saysDayLong } from '#shared/utils/when'
import type { MemberLacking, PrerequisiteNeed } from '#shared/utils/training'
import type { H3Event } from 'h3'

// Who signed up would lack a prerequisite a change from the session's modules to `proposed` adds.
// The preview reads it before saving, and the save reads it again to tell them (G-115 c7, 0243).
export async function lackingFor(sessionId: string, proposed: string[], today: string): Promise<MemberLacking[]> {
  const current = (await db.select({ moduleId: schema.sessionModules.moduleId })
    .from(schema.sessionModules)
    .where(eq(schema.sessionModules.sessionId, sessionId))).map(row => row.moduleId)

  // A brief gates nothing, so it is dropped here exactly as sign-up drops it (G-102 c2).
  const edges = await prerequisitesOf([...new Set([...current, ...proposed])])
  const needs = (moduleIds: string[]): PrerequisiteNeed[] => moduleIds.flatMap(moduleId =>
    (edges.get(moduleId) ?? []).filter(edge => edge.requiresKind !== 'BRIEF'))

  const listed = and(
    eq(schema.sessionAttendees.sessionId, sessionId),
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

  const held = new Map<string, Set<string>>()
  for (const record of records) held.set(record.userId, (held.get(record.userId) ?? new Set()).add(record.moduleId))

  return lackingNewPrerequisites(
    needs(current),
    needs(proposed),
    members.map(member => ({ ...member, held: held.get(member.userId) ?? new Set<string>() })),
  )
}

// Asked for on the save, never implied: the trainer has read the names before choosing to send.
export async function tellLacking(
  event: H3Event,
  session: { id: string, heldOn: string },
  modules: { name: string }[],
  lacking: MemberLacking[],
  at: number,
): Promise<number> {
  let told = 0
  for (const one of lacking) {
    const key = `training.session.needs-first:${session.id}:${one.userId}:${at}`
    if (!(await claimNotification({ userId: one.userId, type: 'training.session.needs-first', key, sessionId: session.id }))) continue
    await notify(event, {
      type: 'training.session.needs-first',
      userId: one.userId,
      claim: key,
      context: {
        name: '',
        heldOn: saysDayLong(session.heldOn),
        taught: saysTaught(modules),
        missing: saysGaps(one.missing),
        sessionsUrl: `${useRuntimeConfig(event).public.baseURL}/training/sessions`,
      },
    })
    told += 1
  }
  return told
}
