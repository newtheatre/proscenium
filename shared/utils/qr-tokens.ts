// D-108's QR token: a reservation id and its HMAC signature, joined by a character neither can
// ever contain (both are hex/base64url), so splitting on it is unambiguous.

const SEPARATOR = '.'

export function encodeQrToken(reservationId: string, signature: string): string {
  return `${reservationId}${SEPARATOR}${signature}`
}

export interface DecodedQrToken {
  reservationId: string
  signature: string
}

export function decodeQrToken(token: string): DecodedQrToken | null {
  const at = token.indexOf(SEPARATOR)
  if (at <= 0 || at === token.length - 1) return null
  return { reservationId: token.slice(0, at), signature: token.slice(at + 1) }
}
