import { workFoh } from '~~/shared/utils/abilities'

/** GET /api/foh/backstage: tonight's code, and who has joined with it. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const scope = await requireFohScope(user)
  if (!scope.performances.length) {
    throw createError({ statusCode: 404, statusMessage: 'You are not working tonight, so there is no code to give out.' })
  }

  const night = await ensureNight(scope.night)
  const { public: { baseURL } } = useRuntimeConfig()
  const code = await deriveCode(night.night, night.epoch)

  // The QR encodes a join link, which rotation neuters: a stale one in
  // someone's browser history is inert (ADR-0020).
  const joinUrl = `${baseURL}/backstage?code=${code}`

  return {
    night: night.night,
    code,
    joinUrl,
    joinQr: `data:image/png;base64,${toBase64(qrPng(joinUrl, { scale: 6 }))}`,
    expiresAt: night.expiresAt,
    devices: await listDevices(night.id, night.epoch),
  }
})
