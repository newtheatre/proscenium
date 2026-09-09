// Marks this device as having seen the message; idempotent, so a doubled tap or a retried
// queue entry never records twice (E-121 criterion 4).
export default defineEventHandler(async (event) => {
  const messageId = getRouterParam(event, 'id') ?? ''
  const device = await requireDevice(event)

  await db.run(acknowledgeStatement(messageId, device.deviceId, newId()))

  return { ok: true }
})
