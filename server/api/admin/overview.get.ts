// What set-up is unfinished and what is on tonight, for the console overview (issue 1358). Each part
// is read only for a caller who could act on it; the rest of the overview reads its own routes.
export default defineEventHandler(async (event) => {
  const resolved = await authority(event)
  await requireSecondFactorIfPrivileged(event, resolved)
  return consoleOverview(event, resolved.permissions)
})
