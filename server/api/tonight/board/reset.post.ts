// Kicks every joined device and moves the code, without ever naming the new one: that travels
// by voice only (E-122 criteria 1, 2, 3).
export default defineEventHandler(async (event) => {
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER')
  const night = await ensureNight(resolved.venueId, resolved.night)

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'board.reset',
    target: `venue:${resolved.venueId}`,
    detail: { night: resolved.night },
  })

  await db.batch([
    db.run(revokeDevicesStatement(night.id)),
    db.run(resetNightStatement(night.id)),
    db.insert(schema.auditLog).values(entry),
  ])

  const recipients = await boardResetRecipients()
  const venue = await venueName(resolved.venueId)
  await Promise.all(recipients.map(recipient => notify(event, {
    userId: recipient.id,
    type: 'board.reset',
    context: { name: '', venueName: venue ?? 'the venue' },
  })))

  return { ok: true }
})
