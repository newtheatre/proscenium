import { PASS_TERMS_PATH } from '#shared/utils/passes'
import { saysDayRange } from '#shared/utils/when'
import { notify } from './notify'
import { passCoveredShows, passCurrentState } from './passes'
import { passQrTokenFor } from './pass-qr-tokens'
import { qrPng } from './qr'
import type { H3Event } from 'h3'

// Kept apart from server/utils/pass-issue.ts, which `tests/` imports directly under Bun:
// `useRuntimeConfig()` needs a real Nitro runtime, so nothing reachable from a unit test may call it.

export interface PassConfirmationContext {
  userId: string
  reference: string
  passTypeName: string
  priceLabel: string
}

// D-124 criterion 5: the holder's own QR, minted the same way a reservation's is, over the
// pass id rather than a reservation id (server/utils/pass-qr-tokens.ts).
export async function sendPassIssued(event: H3Event | undefined, context: PassConfirmationContext, passId: string): Promise<void> {
  const token = await passQrTokenFor(passId)
  const baseURL = useRuntimeConfig(event).public.baseURL
  const url = `${baseURL}/passes/${token}`
  const { width } = qrPng(url)
  const pass = await passCurrentState(passId)
  const shows = (await passCoveredShows(passId, Math.floor(Date.now() / 1000))).map(show => show.title)
  await notify(event, {
    userId: context.userId,
    type: 'pass.issued',
    context: {
      name: '',
      reference: context.reference,
      passType: context.passTypeName,
      priceLabel: context.priceLabel,
      url,
      imageUrl: `${url}/image.png`,
      qrWidth: width,
      termsUrl: `${baseURL}${PASS_TERMS_PATH}`,
      valid: pass ? saysDayRange(pass.validFrom, pass.validUntil) : '',
      shows: shows.join(', '),
    },
  })
}
