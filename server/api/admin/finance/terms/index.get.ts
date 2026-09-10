// Every defined term, for the close screen's picker and I-105's own TERM selector.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'finance.read')
  return { periods: await periodsList() }
})
