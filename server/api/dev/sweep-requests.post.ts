// Runs the room request sweep on demand, so its escalation and expiry can be exercised without
// waiting a day for the cron (K-124).
export default defineEventHandler(async (event) => {
  const at = new Date()
  return { ...await sweepRequests(event, at), unionEscalated: await sweepExternalRequests(event, at) }
})
