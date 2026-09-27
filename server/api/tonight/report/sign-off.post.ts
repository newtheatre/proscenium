import { holdsTheClose, nightSignOffForm, saysIncidentsMoved } from '#shared/utils/night-signoff'

// Sign off and close (issue 1315, E-124, E-114 criteria 3 and 4): the gate, then one batch that
// freezes the report, closes the checklist and reviews its incidents, race-safe by predicate (0006).
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, nightSignOffForm)
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER', input.performanceId ? { performanceId: input.performanceId } : {})

  const target = input.performanceId ?? resolved.performanceIds[0]
  if (!target) throw createError({ statusCode: 403, statusMessage: 'Nothing is running tonight, so there is nothing to sign off' })
  if (!input.performanceId && resolved.performanceIds.length > 1) {
    throw createError({ statusCode: 400, statusMessage: 'More than one performance is running tonight: name the performance' })
  }

  const already = 'This performance has already been signed off'
  if (await reportForPerformance(target)) throw createError({ statusCode: 409, statusMessage: already })

  const compiled = await compileNightReport(target, resolved.venueId, resolved.night)
  const holding = compiled.checklist.filter(holdsTheClose)
  if (holding.length > 0) {
    throw createError({ statusCode: 409, statusMessage: saysBlockedClose(holding.map(item => item.label)) })
  }
  if (compiled.incidents.length !== input.incidentsSeen) {
    throw createError({ statusCode: 409, statusMessage: saysIncidentsMoved(input.incidentsSeen, compiled.incidents.length) })
  }

  const id = newId()
  const [freeze, ...then] = signOffAndCloseStatements({
    id,
    performanceId: target,
    venueId: resolved.venueId,
    night: resolved.night,
    closingNote: input.closingNote,
    report: reviewedAtSignOff(compiled),
    signedBy: resolved.account.id,
    signedVia: resolved.via,
    incidentsSeen: input.incidentsSeen,
    closeId: newId(),
    signedEntry: auditEntry({
      actorId: resolved.account.id,
      action: 'night-report.signed',
      target: `performance:${target}`,
      detail: { night: resolved.night, via: resolved.via },
    }),
    closedEntry: auditEntry({
      actorId: resolved.account.id,
      action: 'checklist.closed',
      target: `performance:${target}`,
      detail: { night: resolved.night },
    }),
  })

  const [frozen] = await db.batch([db.all<{ id: string }>(freeze), ...then.map(statement => db.run(statement))])
  if (!Array.isArray(frozen) || frozen.length === 0) {
    // Lost to a second sign-off, or an incident logged between the read above and the batch.
    if (await reportForPerformance(target)) throw createError({ statusCode: 409, statusMessage: already })
    const logged = (await reportIncidents(target)).length
    throw createError({ statusCode: 409, statusMessage: saysIncidentsMoved(input.incidentsSeen, logged) })
  }

  // The sign-off is written by this point, so an error here would tell a duty manager the write
  // failed when it did not; the letter is what is missed, and a reload finds the report (K-128).
  const row = await reportForPerformance(target)
  if (!row) return { ok: true, report: null, notice: 'The sign-off was recorded. Reload the page to see it.' }

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
