// Single-use codes for the day the authenticator is lost (A-110). Eight of them, shown once,
// stored only as hashes.

export const RECOVERY_CODE_COUNT = 8

// No look-alikes: nothing a person reading one aloud or writing it down can confuse.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const GROUP = 4
const GROUPS = 3

export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(GROUP * GROUPS))
  const characters = [...bytes].map(byte => ALPHABET[byte % ALPHABET.length])
  return Array.from({ length: GROUPS }, (_, group) => characters.slice(group * GROUP, (group + 1) * GROUP).join('')).join('-')
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, generateRecoveryCode)
}

// Compared without its grouping and case, so a code typed as it was read still matches.
export function normaliseRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '')
}
