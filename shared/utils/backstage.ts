import { z } from 'zod'

// The backstage board's join code (E-120). Derived, never stored: the same secret, night, venue
// and epoch always produce the same code, and a rotated epoch produces a different one.

export const BOARD_CODE_DIGITS = 6
// Criterion 4's own number, not a workshop configuration key: the story states it directly.
export const MAX_FAILED_ATTEMPTS = 10

async function hmacSha256(key: string, message: string): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(message)))
}

// Domain-separated from every other use of the session password: the message names what this
// signs, so the same key signing something else can never collide with a board code.
export async function deriveBoardCode(secret: string, night: string, venueId: string, epoch: number): Promise<string> {
  const digest = await hmacSha256(secret, `backstage-board:${night}:${venueId}:${epoch}`)
  const offset = digest[digest.length - 1]! & 0x0F
  const truncated
    = ((digest[offset]! & 0x7F) << 24)
      | ((digest[offset + 1]! & 0xFF) << 16)
      | ((digest[offset + 2]! & 0xFF) << 8)
      | (digest[offset + 3]! & 0xFF)
  return String(truncated % 10 ** BOARD_CODE_DIGITS).padStart(BOARD_CODE_DIGITS, '0')
}

const LABEL_LIMIT = 50

export const boardJoinForm = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the six-digit code'),
  label: z.string().trim().min(1).max(LABEL_LIMIT),
})

export type BoardJoinInput = z.output<typeof boardJoinForm>
