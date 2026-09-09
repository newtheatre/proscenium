import { boardJoinForm } from '#shared/utils/backstage'

// Deliberately public: no account and no personal data, a spoken code and a display label are
// the whole of it (E-120 criterion 1). Wrong guesses never say which venue they were closest to.
export default defineEventHandler(async (event) => {
  const { code, label } = await readValidatedBodyOrThrow(event, boardJoinForm)
  const secret = backstageBoardSecret()
  const night = currentShowNight()

  const joined = await attemptJoin(secret, night, code, label)
  if (!joined) throw createError({ statusCode: 401, statusMessage: 'That code was not recognised' })

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: null,
    action: 'board.joined',
    target: `venue:${joined.venueId}`,
    detail: { night },
  }))

  return { ok: true, token: joined.token, venueName: joined.venueName }
})
