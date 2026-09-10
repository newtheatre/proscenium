import { joinWaitingListForm } from '#shared/utils/waiting-list'

// Join the waiting list for a sold-out (or any) performance (D-113 criterion 1). Guest checkout
// works exactly as D-104's does: an existing address is reused, a new one becomes a guest account.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, joinWaitingListForm)
  if (input.performanceId !== id) throw createError({ statusCode: 400, statusMessage: 'Performance mismatch' })

  const performance = await performanceById(id)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  const account = await currentAccount(event)
  const email = account?.email ?? input.guest?.email
  const name = account?.name ?? input.guest?.name
  if (!email || !name) {
    throw createError({ statusCode: 400, statusMessage: 'A name and an email address are required to join as a guest' })
  }

  const booker = account ? { id: account.id } : await guestAccount(email, name)

  const result = await joinWaitingList({ performanceId: id, userId: booker.id, partySize: input.partySize })
  if (!result.joined) {
    throw createError({ statusCode: 409, statusMessage: 'This email address is already on the waiting list for this performance' })
  }

  const token = await waitingListTokenFor(result.id)
  await sendWaitingListJoined(event, {
    userId: booker.id,
    showTitle: performance.showTitle,
    startsAt: performance.startsAt,
    partySize: input.partySize,
    token,
  })

  return { ok: true }
})
