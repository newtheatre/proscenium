// Deliberately public: monitoring holds no session. 503 whenever the schema is behind the
// code, naming the pending files (K-107). The lines beside `ok` are reported, never failing it.
export default defineEventHandler(async (event) => {
  const status = await healthStatus(event)
  const reported = { sessionKey: status.sessionKey, bankHolidays: status.bankHolidays, shiftEligibility: status.shiftEligibility }

  if (!status.ok) {
    setResponseStatus(event, 503)
    return { ok: false, pendingMigrations: status.pendingMigrations, ...reported }
  }

  return { ok: true, ...reported }
})
