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

  // Minted before the write: a signing failure must refuse the join outright rather than leave a
  // WAITING row nobody holds a link to, which a retry then refuses as a duplicate.
  const entryId = newId()
  const token = await waitingListTokenFor(entryId)

  const result = await joinWaitingList({ id: entryId, performanceId: id, userId: booker.id, partySize: input.partySize })
  if (!result.joined) {
    throw createError({ statusCode: 409, statusMessage: 'This email address is already on the waiting list for this performance' })
  }

  // Best-effort past the commit: the entry is real either way, so the answer says whether the
  // letter went rather than raising a 500 over a change that has already happened (0003).
  let emailed = true
  try {
    await sendWaitingListJoined(event, {
      userId: booker.id,
      showTitle: performance.showTitle,
      startsAt: performance.startsAt,
      partySize: input.partySize,
      token,
    })
  }
  catch (error) {
    emailed = false
    console.error('[waiting-list] joined but could not send the confirmation', error)
  }

  return { ok: true, emailed }
})
