// Sends a paid till sale's receipts, each person's in a unit of its own. A receipt already sent is
// skipped, so a retry sends only what failed.
import { defineJob } from '#kit'
import { sendTillReceipts } from '../splits'

export default defineJob<{ intentId: string }>(async (payload) => {
  await sendTillReceipts(payload.intentId)
})
