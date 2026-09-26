// A member takes back their own open pass request (issue 1331). Somebody else's request answers
// as one that does not exist, so a guessed id reveals nothing.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const id = getRouterParam(event, 'id') ?? ''

  const request = await passRequestById(id)
  if (!request || request.userId !== account.id) throw noSuch('pass request')

  const withdrawn = await withdrawPassRequest(request, account.id)
  if (!withdrawn) {
    throw createError({ statusCode: 409, statusMessage: 'This request has already been settled at the box office desk.' })
  }

  return { ok: true }
})
