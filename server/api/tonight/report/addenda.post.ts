import { addendumForm } from '#shared/utils/night-signoff'

// A correction to a frozen report: a new row naming what it corrects, never an edit (criterion
// 5). Not shift-scoped like sign-off itself: a correction may be found days after the night.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, addendumForm)
  const resolved = await requirePermission(event, 'night.manage')

  const row = await reportForPerformance(input.performanceId)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'That performance has not been signed off yet' })

  const id = newId()
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'night-report.addendum',
    target: `night-report:${row.id}`,
    detail: { night: row.night },
  })
  await db.batch([
    db.run(addAddendumStatement({ id, reportId: row.id, note: input.note, addedBy: resolved.account.id })),
    db.insert(schema.auditLog).values(entry),
  ])

  const venue = (await venueName(row.venueId)) ?? 'the venue'
  const message = render('night-report-addendum', {
    name: '',
    venueName: venue,
    night: row.night,
    addedByName: resolved.account.name,
    note: input.note,
  })
  await distributeReport(event, row.id, id, resolved.account.email, message)

  return { ok: true, id }
})
