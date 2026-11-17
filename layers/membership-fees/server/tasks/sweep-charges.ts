// Charges past membership-fees.retention.charges are removed. An open charge is never removed: its
// application is still waiting, or has just expired and is voided first.
import { defineTask, nowMs, retentionSeconds } from '#kit'
import { charges } from '../db/schema'

const SECOND = 1000 // not-policy: milliseconds in a second

export default defineTask(async (unit) => {
  const keep = await retentionSeconds(charges)
  if (keep === null) return
  unit.add({ sql: "DELETE FROM membership_fees_charges WHERE state <> 'open' AND created_at < ?", params: [nowMs() - keep * SECOND] })
})
