// The modules a member could take next, computed on every read so a new record shows immediately.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const items = await whatsNextFor(account.id, londonToday())
  return { items, total: items.length }
})
