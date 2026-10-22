// The code a tab holder shows from My NNT so somebody else may charge their tab tonight (F-108
// criterion 6, 0164). Crockford's alphabet, so a code read aloud or typed survives O for 0 and I for 1.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const TAB_CODE_LENGTH = 8

// Forty bits of the signature, five to a character: enough that guessing one is hopeless.
export function tabCodeFromBytes(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let code = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5 && code.length < TAB_CODE_LENGTH) {
      code += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
    if (code.length === TAB_CODE_LENGTH) break
  }
  return code
}

// What a volunteer typed or a camera read, in the form the server compares; null is no code at all.
export function normaliseTabCode(typed: string | null | undefined): string | null {
  const code = (typed ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').replaceAll('O', '0').replace(/[IL]/g, '1')
  return code === '' ? null : code
}

// Split in two, as a person reads it out.
export function saysTabCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

export const TAB_CODE_NEEDED = 'needs their tab code from My NNT before it can be charged'
