// Deliberately public: monitoring holds no session. 503 whenever the schema is behind the
// code, naming the pending files (K-107).
export default defineEventHandler(async (event) => {
  const status = await healthStatus(event)

  if (!status.ok) {
    setResponseStatus(event, 503)
    return { ok: false, pendingMigrations: status.pendingMigrations, sessionKey: status.sessionKey, bankHolidays: status.bankHolidays }
  }

  return { ok: true, sessionKey: status.sessionKey, bankHolidays: status.bankHolidays }
})
