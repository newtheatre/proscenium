import { signOffForm } from '#shared/utils/night-signoff'

// Sign off tonight's report: the checklist gate, then the freeze (E-124 criteria 1, 2, 3).
// A second sign-off for the same performance refuses, race-safe by predicate (0006).
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, signOffForm)
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER', input.performanceId ? { performanceId: input.performanceId } : {})

  const target = input.performanceId ?? resolved.performanceIds[0]
  if (!target) throw createError({ statusCode: 403, statusMessage: 'Nothing is running tonight, so there is nothing to sign off' })
  if (!input.performanceId && resolved.performanceIds.length > 1) {
    throw createError({ statusCode: 400, statusMessage: 'More than one performance is running tonight: name the performance' })
  }

  const closed = await closeFor(resolved.venueId, resolved.night)
  if (!closed) throw createError({ statusCode: 409, statusMessage: 'Tonight\'s checklist has not been closed yet' })

  const report = await compileNightReport(target, resolved.venueId, resolved.night)
  const id = newId()
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'night-report.signed',
    target: `performance:${target}`,
    detail: { night: resolved.night, via: resolved.via },
  })

  const signed = await auditedWrite(
    db.all<{ id: string }>(signOffStatement({
      id,
      performanceId: target,
      venueId: resolved.venueId,
      night: resolved.night,
      closingNote: input.closingNote,
      report,
      signedBy: resolved.account.id,
      signedVia: resolved.via,
    })),
    entry,
  )
  if (!signed) throw createError({ statusCode: 409, statusMessage: 'This performance has already been signed off' })

  const row = await reportForPerformance(target)
  if (!row) throw createError({ statusCode: 500, statusMessage: 'Signed off but could not be read back' })

  const venue = (await venueName(resolved.venueId)) ?? 'the venue'
  const message = render('night-report-signed', {
    name: '',
    venueName: venue,
    night: row.night,
    signedByName: row.signedByName,
    officerBypass: resolved.via === 'OFFICER',
    closingNote: row.closingNote,
  })
  await distributeReport(event, row.id, null, resolved.account.email, message)

  return { ok: true, report: row }
})
