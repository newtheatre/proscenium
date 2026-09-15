// One holder's tab, itemised, so the register can show a manager exactly what a void undoes
// (F-109 criteria 1, 4).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.write')
  const holderId = getRouterParam(event, 'holderId') ?? ''

  const tab = await itemisedTab(holderId)
  if (!tab) throw createError({ statusCode: 404, statusMessage: 'No such tab holder' })

  return { ok: true, tab }
})
