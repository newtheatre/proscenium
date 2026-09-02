import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { gapKey, saysGaps } from '#shared/utils/training'
import { blockingGaps, walkInRejoinStatement, walkInStatement, warningGaps } from '#shared/utils/training-signup'

const body = z.object({
  userId: z.string().trim().min(1).max(64),
  // One key per ordinary gap the trainer takes responsibility for. A safety-critical gap has no
  // key and no path: nothing in this body can wave one through (G-117 criterion 4).
  acknowledged: z.array(z.string().trim().min(1).max(200)).max(40).default([]),
})

// Add somebody who turned up to an open register. They join it like anybody else: absent until
// marked, and subject to the exact-cover rule when it is (G-117).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'No session named' })

  const resolved = await requireTrainer(event)
  const input = await readValidatedBodyOrThrow(event, body)

  // The modules come from the one definition sign-up reads, so a walk-in is judged by the same
  // rule as somebody who signed up in advance.
  const session = await sessionForSignUp(id)
  if (!session) throw createError({ statusCode: 404, statusMessage: 'No such session' })

  const [held] = await db.select({
    trainerId: schema.trainingSessions.trainerId,
    markedAt: schema.trainingSessions.markedAt,
  })
    .from(schema.trainingSessions)
    .where(eq(schema.trainingSessions.id, id))
    .limit(1)

  const mine = held?.trainerId === resolved.account.id
  if (!mine && !resolved.permissions.has('training.write')) {
    throw createError({ statusCode: 403, statusMessage: 'Only the trainer running this session may add to its register' })
  }
  if (session.status === 'CANCELLED') {
    throw createError({ statusCode: 409, statusMessage: 'That session was cancelled, so nobody can be added to it' })
  }
  if (session.registerOpenedAt === null) {
    throw createError({ statusCode: 409, statusMessage: 'The register is not open yet' })
  }
  if (held?.markedAt !== null) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This register has already been marked, so adding somebody now would award them nothing',
    })
  }
  if (session.modules.length === 0) {
    throw createError({ statusCode: 409, statusMessage: 'This session teaches nothing, so there is nothing to add somebody to' })
  }

  const person = await findById(input.userId)
  if (!person) throw createError({ statusCode: 404, statusMessage: 'No such person' })
  if (person.anonymisedAt !== null) {
    throw createError({
      statusCode: 409,
      statusMessage: 'That account has been erased, so nothing can be recorded against it',
    })
  }

  const gaps = await prerequisiteGapsFor(input.userId, session.modules, londonToday())
  const blocked = blockingGaps(gaps)
  if (blocked.length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `This session is safety critical, so it needs ${saysGaps(blocked)} first`,
    })
  }
  const warnings = warningGaps(gaps)
  const keyed = warnings.map(gap => ({ ...gap, key: gapKey({ ...gap, userId: input.userId }) }))
  const outstanding = keyed.filter(gap => !input.acknowledged.includes(gap.key))
  if (outstanding.length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `They do not hold ${saysGaps(outstanding)}. Confirm that and they can be added`,
      data: { gaps: keyed },
    })
  }

  // Two conditional writes rather than a read and then one, the shape sign-up uses: the unique pair
  // refuses a second live row, and the revival predicate refuses anything but a withdrawn one.
  const at = Math.floor(Date.now() / 1000)
  const [added] = await db.batch([db.all<{ id: string }>(walkInStatement(newId(), id, input.userId, at))])
  let took = added.length > 0
  if (!took) {
    const [revived] = await db.batch([db.all<{ id: string }>(walkInRejoinStatement(id, input.userId, at))])
    took = revived.length > 0
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'session.attendee.added',
    target: `session:${id}`,
    detail: { userId: input.userId, acknowledged: input.acknowledged.length },
  }))

  // Already on the register is not a failure: they are on it, which is what was asked for.
  return { ok: true, added: took }
})
