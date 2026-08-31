import { eq } from 'drizzle-orm'
import { awardFellowship as body } from '#shared/utils/admin-forms'

// Record a fellowship (A-127).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'fellowships.write')
  const input = await readValidatedBodyOrThrow(event, body)

  const account = await findById(input.userId)
  if (!account) throw createError({ statusCode: 404, statusMessage: 'No such account' })
  if (account.anonymisedAt !== null) {
    throw createError({ statusCode: 409, statusMessage: 'That account has been erased' })
  }

  // A person is a Fellow once, and the constraint is what enforces it (criterion 2). This is the
  // sentence somebody reads instead of a unique violation.
  const [held] = await db.select({ id: schema.fellowships.id })
    .from(schema.fellowships).where(eq(schema.fellowships.userId, input.userId)).limit(1)
  if (held) throw createError({ statusCode: 409, statusMessage: 'That person already holds a fellowship' })

  const id = newId()
  await db.batch([
    db.insert(schema.fellowships).values({
      id,
      userId: input.userId,
      awardedOn: input.awardedOn,
      awardedBy: input.awardedBy,
      citation: input.citation,
    }),
    // The id and nothing else: the citation is public wording but the trail is not where it lives
    // (criterion 5, 0011).
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'fellowship.awarded',
      target: `user:${input.userId}`,
      detail: { fellowship: id },
    })),
  ])

  return { ok: true, id }
})
