// One pass product, with its price points and the shows it covers.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  await requirePermission(event, 'ticketing.read')

  const passType = await passTypeById(id)
  if (!passType) throw noSuch('pass')

  return { passType, shows: await listShowOptions() }
})
