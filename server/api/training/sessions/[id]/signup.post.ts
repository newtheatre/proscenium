import { saysGaps } from '#shared/utils/training'
import {
  blockingGaps,
  refreshBadgeStatement,
  rejoinStatement,
  saysClosure,
  signUpClosure,
  signUpStatement,
  warningGaps,
} from '#shared/utils/training-signup'

// Sign up to a session. It never refuses for fullness: past capacity you join the order and are
// told where in it you are (G-105 criteria 1 and 4).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const sessionId = getRouterParam(event, 'id')
  if (!sessionId) throw createError({ statusCode: 400, statusMessage: 'No session named' })

  const session = await sessionForSignUp(sessionId)
  if (!session) throw createError({ statusCode: 404, statusMessage: 'No such session' })

  const closesHours = await configValue(event, 'SESSION_SIGNUP_CLOSES_HOURS')
  const closure = signUpClosure(windowOf(session), closesHours, new Date())
  if (closure) throw createError({ statusCode: 409, statusMessage: saysClosure(closure) })

  // Criteria 3 and 6. Expiring counts as held, because `modulesHeldBy` is the one definition of
  // held and the warning window cancels out in it.
  const gaps = await prerequisiteGapsFor(account.id, session.modules, londonToday())
  const blocked = blockingGaps(gaps)
  if (blocked.length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `This one is safety critical, so it needs ${saysGaps(blocked)} first. `
        + 'Ask for those to be taught and you can come to the next one.',
    })
  }

  // Two conditional writes, never a read followed by one: the unique pair refuses a second live
  // sign-up, and the re-join predicate refuses anything but a withdrawn row (0006).
  const at = Math.floor(Date.now() / 1000)
  const [joined] = await db.batch([
    db.all<{ id: string }>(signUpStatement(newId(), sessionId, account.id, at)),
    db.run(refreshBadgeStatement(sessionId)),
  ])

  let took = joined.length > 0
  if (!took) {
    const [rejoined] = await db.batch([
      db.all<{ id: string }>(rejoinStatement(sessionId, account.id, at)),
      db.run(refreshBadgeStatement(sessionId)),
    ])
    took = rejoined.length > 0
  }

  const places = await placesOnSession(sessionId)
  const mine = places.places.find(place => place.userId === account.id)
  if (!mine) throw createError({ statusCode: 409, statusMessage: 'That sign-up did not stick. Please try again.' })

  return {
    ok: true,
    // False means they were already on the list, so nothing moved and nothing is wrong.
    joined: took,
    position: mine.position,
    placed: mine.placed,
    waitlistPosition: mine.waitlistPosition,
    warnings: warningGaps(gaps),
  }
})
