// A member's own held passes and their own pending requests (D-124 criterion 5), and what may
// still be requested. An active pass carries its QR, so it can be shown at the door (issue 1332).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const [held, requests, sellable] = await Promise.all([
    heldPasses(account.id),
    ownPassRequests(account.id),
    sellablePassTypes(),
  ])
  const base = useRuntimeConfig(event).public.baseURL
  const passes = await Promise.all(held.map(async pass => ({
    ...pass,
    qrSvg: pass.status === 'ACTIVE' ? qrSvgBase64(`${base}/passes/${await passQrTokenFor(pass.id)}`) : null,
  })))
  return { passes, requests, sellable }
})
