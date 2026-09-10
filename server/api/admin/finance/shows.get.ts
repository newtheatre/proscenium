// Every show, for the foregone report's picker (I-103): the same query the box office's own
// picker uses, gated on `finance.read` so the treasurer needs no programme permission for it.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'finance.read')
  return await listShowOptions()
})
