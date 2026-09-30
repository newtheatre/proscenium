// Which severities are committee-configured to route to the Theatre Manager (E-116 criterion 1).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'safety.read')
  return { severities: await severityConfig() }
})
