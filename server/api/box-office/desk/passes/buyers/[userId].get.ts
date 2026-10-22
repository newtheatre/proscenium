// Whether the chosen buyer is a current member, beside the price: the desk sells a member price
// point to whoever it is told to, so the officer needs to see it.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.write')
  const userId = getRouterParam(event, 'userId') ?? ''
  return { member: await hasCurrentMembership(event, userId, new Date()) }
})
