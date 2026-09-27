import { showsPassQr } from '#shared/utils/passes'

// A member's own passes, each the door would admit with its QR (issue 1332), their pending requests
// (D-124 criterion 5), and each type on sale, saying whether it is held or asked for (issue 1331).
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
  return {
    passes,
    requests,
    sellable: sellable.map(type => ({
      ...type,
      held: passes.some(pass => pass.passTypeId === type.id && pass.status === 'ACTIVE'),
      openRequestId: requests.find(request => request.passTypeId === type.id && request.status === 'PENDING')?.id ?? null,
    })),
  }
})
