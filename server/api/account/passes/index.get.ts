import { showsPassQr } from '#shared/utils/passes'

// A member's own held passes and their own pending requests (D-124 criterion 5), and what may
// still be requested. A pass the door would admit carries its QR, to be shown there (issue 1332).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const [held, requests, sellable] = await Promise.all([
    heldPasses(account.id),
    ownPassRequests(account.id),
    sellablePassTypes(),
  ])
  const base = useRuntimeConfig(event).public.baseURL
  const now = Math.floor(Date.now() / 1000)
  const passes = await Promise.all(held.map(async pass => ({
    ...pass,
    qrSvg: showsPassQr(pass, now) ? qrSvgBase64(`${base}/passes/${await passQrTokenFor(pass.id)}`) : null,
  })))
  return { passes, requests, sellable }
})
