// Tonight's board, polled: every message and who has acknowledged each one (E-121 criteria 3, 4).
export default defineEventHandler(async (event) => {
  const device = await requireDevice(event)
  const [messages, acknowledgements] = await Promise.all([
    messagesForNight(device.nightId),
    acknowledgementsForNight(device.nightId),
  ])
  return { messages, acknowledgements }
})
