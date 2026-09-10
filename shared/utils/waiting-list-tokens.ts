// D-113's waiting-list token: an entry id and its HMAC signature, joined by a character neither
// can ever contain (both are hex/base64url), so splitting on it is unambiguous (qr-tokens.ts).

const SEPARATOR = '.'

export function encodeWaitingListToken(entryId: string, signature: string): string {
  return `${entryId}${SEPARATOR}${signature}`
}

export interface DecodedWaitingListToken {
  entryId: string
  signature: string
}

export function decodeWaitingListToken(token: string): DecodedWaitingListToken | null {
  const at = token.indexOf(SEPARATOR)
  if (at <= 0 || at === token.length - 1) return null
  return { entryId: token.slice(0, at), signature: token.slice(at + 1) }
}
