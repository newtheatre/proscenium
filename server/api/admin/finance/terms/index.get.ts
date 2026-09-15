// Every defined term, for the close screen's picker and I-105's own TERM selector. The dashboard
// that reads it is open to `finance.summary` too, and a term is a label and a range, not a figure.
export default defineEventHandler(async (event) => {
  await requireAnyPermission(event, ['finance.read', 'finance.summary'])
  return { periods: await periodsList() }
})
