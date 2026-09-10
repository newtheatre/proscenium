// Every close and reopen, newest first: the close history I-107 criterion 4 asks to stay visible.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'finance.read')
  return { locks: await periodLocksHistory() }
})
