// Tonight's board, polled: every message, who has acknowledged each one, and which of the
// crew's own calls front of house has seen (E-121 criteria 3, 4, 7).
export default defineEventHandler(async (event) => {
  const device = await requireDevice(event)
  const [messages, acknowledgements, seen] = await Promise.all([
    messagesForNight(device.nightId),
    acknowledgementsForNight(device.nightId),
    seenAcross(device.nightId),
  ])
  return { messages, acknowledgements, seen, deviceId: device.deviceId }
})
