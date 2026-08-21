/** GET /api/backstage/session — is this device still joined? */
export default defineEventHandler(async (event) => {
  const session = await requireBackstageSession(event)
  return { night: session.night, deviceName: session.deviceName }
})
