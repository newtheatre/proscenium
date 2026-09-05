import { restoreDrillForm as body } from '#shared/utils/backup'

// Record a restore drill's outcome (K-108 criterion 3, J-107 criterion 3).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'backups.write')
  const input = await readValidatedBodyOrThrow(event, body)

  const id = newId()
  await db.batch([
    db.insert(schema.backupDrills).values({
      id,
      ranAt: input.ranAt,
      operatorId: resolved.account.id,
      outcome: input.outcome,
      timeToRestoreMinutes: input.timeToRestoreMinutes,
      rowCountsMatch: input.rowCountsMatch,
      moneyTotalsMatch: input.moneyTotalsMatch,
      notes: input.notes ?? null,
    }),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'backup.drill-recorded',
      target: id,
      detail: { outcome: input.outcome, rowCountsMatch: input.rowCountsMatch, moneyTotalsMatch: input.moneyTotalsMatch },
    })),
  ])

  return { ok: true, id }
})
