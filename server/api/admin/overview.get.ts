// What set-up is unfinished and what is on tonight, for the console overview (issue 1358). Each part
// is read only for a caller who could act on it; the rest of the overview reads its own routes.
export default defineEventHandler(async (event) => {
  const resolved = await authority(event)
  // A role still owing its authenticator narrows this to what the other grants open (0152).
  await requireSecondFactorIfPrivileged(event, resolved, [...resolved.permissions])
  return consoleOverview(event, resolved.permissions)
})
