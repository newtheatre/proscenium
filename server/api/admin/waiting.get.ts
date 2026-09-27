// The queues the caller decides, each counted as its own screen opens (A-130 criterion 8, issue
// 1358). The sidebar and the overview both read this one answer, so they cannot disagree.
export default defineEventHandler(async (event) => {
  const resolved = await authority(event)
  await requireSecondFactorIfPrivileged(event, resolved)
  // The demand board's own scope, so the count and the board it opens on agree (G-110).
  const leadOf = scopeToLeadOf(resolved)
  const leads = leadOf !== undefined && (await liveLeads(leadOf)).length > 0
  return { counts: await waitingCounts(resolved.permissions, leadOf, leads) }
})
