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

// Milestones, presets and free text (E-121). One row per message, but which of the three a
// caller means is always exactly one of these three shapes, never a mix.

export const FREE_TEXT_LIMIT = 500

export const postMessageForm = z.object({
  milestoneTypeId: z.string().min(1).nullable().default(null),
  presetId: z.string().min(1).nullable().default(null),
  body: z.string().trim().min(1).max(FREE_TEXT_LIMIT).nullable().default(null),
  // The device's own clock at the moment of composing, carried through an offline queue
  // unchanged (criterion 6); never trusted for ordering, only for display.
  composedAt: z.number().int().positive(),
}).refine(
  data => [data.milestoneTypeId, data.presetId, data.body].filter(value => value !== null).length === 1,
  'Send exactly one of a milestone, a preset, or free text',
)

export type PostMessageInput = z.output<typeof postMessageForm>

// A correction names a different milestone; nothing else is ever superseded (criterion 5).
export const supersedeMessageForm = z.object({
  milestoneTypeId: z.string().min(1),
  composedAt: z.number().int().positive(),
})

export type SupersedeMessageInput = z.output<typeof supersedeMessageForm>

const CONFIG_LABEL_LIMIT = 100
const PRESET_BODY_LIMIT = 200

export const milestoneTypeForm = z.object({
  label: z.string().trim().min(1).max(CONFIG_LABEL_LIMIT),
  sort: z.number().int(),
})

export type MilestoneTypeInput = z.output<typeof milestoneTypeForm>

export const presetForm = z.object({
  label: z.string().trim().min(1).max(CONFIG_LABEL_LIMIT),
  body: z.string().trim().min(1).max(PRESET_BODY_LIMIT),
  sort: z.number().int(),
})

export type PresetInput = z.output<typeof presetForm>

// Purged after this many days, milestone events excepted, which are night-report data and
// persist forever (E-122 criterion 4).
export const MESSAGE_RETENTION_DAYS = 30
