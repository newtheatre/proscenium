// A signed report after its night, opened from /reports: the frozen snapshot verbatim, its addenda
// and who it reached. Incidents are in it, so it is the night's and safety's officers' (0239).
export default defineEventHandler(async (event) => {
  const performanceId = getRouterParam(event, 'performanceId') ?? ''
  await requireAnyPermission(event, ['night.manage', 'safety.read'])

  const signed = await reportForPerformance(performanceId)
  if (!signed) throw createError({ statusCode: 404, statusMessage: 'That performance has not been signed off yet' })

  const [performance, addenda, deliveries] = await Promise.all([
    tonightPerformance(performanceId),
    addendaForReport(signed.id),
    deliveriesForReport(signed.id),
  ])
  return {
    ...signed.report,
    showTitle: performance?.showTitle ?? null,
    venueName: performance?.venueName ?? null,
    startsAt: performance?.startsAt ?? null,
    signedOff: {
      closingNote: signed.closingNote,
      signedByName: signed.signedByName,
      signedVia: signed.signedVia,
      signedAt: signed.signedAt,
    },
    addenda,
    deliveries: deliveries.map(delivery => ({ recipient: delivery.recipient, status: delivery.status, sentAt: delivery.sentAt })),
  }
})
