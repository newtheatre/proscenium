import { currentShowNight } from '#shared/utils/show-night'
import { TAB_CODE_NEEDED, normaliseTabCode, tabCodeFromBytes } from '#shared/utils/tab-presence'

// Signed as a booking's QR is (D-108), domain-separated by `tab:`, and scoped to one show night
// so a code shown last week charges nothing tonight (0164, 0014).
export async function tabPresenceCode(holderId: string, night: string = currentShowNight()): Promise<string> {
  const token = await qrTokenFor(`tab:${holderId}:${night}`)
  const signature = token.slice(token.lastIndexOf('.') + 1)
  const bytes = Uint8Array.from(atob(signature.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
  return tabCodeFromBytes(bytes)
}

// Your own tab needs no code; anybody else's needs the holder's code for tonight (F-108 criterion 6).
export async function requireHolderPresent(holder: { id: string, name: string }, actorId: string, night: string, typed: string | null): Promise<void> {
  if (holder.id === actorId) return
  const code = normaliseTabCode(typed)
  const expected = await tabPresenceCode(holder.id, night)
  if (code !== null && code.length === expected.length && timingSafeEqualText(code, expected)) return
  throw createError({
    statusCode: 403,
    statusMessage: code === null
      ? `${holder.name}'s tab ${TAB_CODE_NEEDED}. Nothing has been charged.`
      : `That is not ${holder.name}'s tab code for tonight. Nothing has been charged.`,
    data: { tabCodeFor: holder.name },
  })
}

function timingSafeEqualText(a: string, b: string): boolean {
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
