// Leave the waiting list, whatever state the entry is in (D-113 criterion 4: "at any time").
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const entryId = await verifyWaitingListToken(token)
  if (!entryId) throw noSuch('waiting-list entry', 'Ask us for a new link if you still want the seats')

  await removeWaitingListEntry(entryId, new Date())
  // Idempotent by design: removing an already-removed or already-claimed entry still reads as
  // success, so a link opened twice (or after the offer was claimed) never looks like an error.
  return { ok: true }
})
