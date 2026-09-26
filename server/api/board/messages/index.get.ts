// Tonight's board, polled: every message, the acknowledgements and the ticks (E-121 criteria 3, 4,
// 7), with the venue's name, so a phone whose cookie still works reopens it on reload (issue 1313).
export default defineEventHandler(async (event) => {
  const device = await requireDevice(event)
  const [messages, acknowledgements, seen, venue] = await Promise.all([
    messagesForNight(device.nightId),
    acknowledgementsForNight(device.nightId),
    seenAcross(device.nightId),
    venueName(device.venueId),
  ])
  return { messages, acknowledgements, seen, deviceId: device.deviceId, venueName: venue ?? null }
})
