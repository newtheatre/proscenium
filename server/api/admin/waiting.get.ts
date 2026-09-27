// The queues the caller decides, each counted as its own screen opens (A-130 criterion 8, issue
// 1358). The sidebar and the overview both read this one answer, so they cannot disagree.
export default defineEventHandler(async (event) => {
  const resolved = await authority(event)
  await requireSecondFactorIfPrivileged(event, resolved)
  const leads = !resolved.permissions.has('training.read') && (await liveLeads(resolved.account.id)).length > 0
  return { counts: await waitingCounts(resolved.permissions, resolved.account.id, leads) }
})
