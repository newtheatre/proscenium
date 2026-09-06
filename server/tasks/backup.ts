// Weekly, K-108 criterion 1. Point-in-time restore is D1 Time Travel, already automatic and
// documented (docs/operations.md); the drill and its cadence are K-108 criteria 2 to 4.
export default defineTask({
  meta: {
    name: 'backup',
    description: 'Weekly export manifest to R2, alerting on failure (K-108, J-107)',
  },
  async run() {
    const result = await runWeeklyExport()
    // A failure alerts rather than vanishing: the cron log is not somewhere anybody looks
    // (J-107 criterion 2).
    if (!result.ok) {
      await db.insert(schema.auditLog).values(auditEntry({
        actorId: null,
        action: 'backup.export-failed',
        detail: { error: result.error },
      }))
    }
    return { result }
  },
})
