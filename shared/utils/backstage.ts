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

// Front of house's own end of the board (E-121 criterion 7). Derived and never issued to
// anybody, so nothing can present it: the row it credentials only owns FOH's calls and ticks.
export async function deriveFohCredential(secret: string, nightId: string): Promise<string> {
  const digest = await hmacSha256(secret, `backstage-board-foh-device:${nightId}`)
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')
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
  label: z.string().trim().min(1, 'Give it a label').max(LABEL_LIMIT),
})

export type BoardJoinInput = z.output<typeof boardJoinForm>

// Milestones, presets and free text (E-121). One row per message, but which of the three a
// caller means is always exactly one of these three shapes, never a mix.

export const FREE_TEXT_LIMIT = 500

export const postMessageForm = z.object({
  milestoneTypeId: z.string().min(1, 'Say which milestone you mean').nullable().default(null),
  presetId: z.string().min(1, 'Say which preset you mean').nullable().default(null),
  body: z.string().trim().min(1, 'Say what the message is').max(FREE_TEXT_LIMIT).nullable().default(null),
  // The device's own clock at the moment of composing, carried through an offline queue
  // unchanged (criterion 6); never trusted for ordering, only for display.
  composedAt: z.number().int().positive(),
// Load-bearing for retention: a milestone row's body is null by construction, so the 30-day
// purge can never be asked to keep crew free text alive under cover of a kept milestone.
}).refine(
  data => [data.milestoneTypeId, data.presetId, data.body].filter(value => value !== null).length === 1,
  'Send exactly one of a milestone, a preset, or free text',
)

export type PostMessageInput = z.output<typeof postMessageForm>

// Front of house sends a preset or free text, never a milestone: the night report's timeline
// stays crew-authored, and a call from the foyer is not an event the show passed through.
export const fohMessageForm = z.object({
  presetId: z.string().min(1, 'Say which preset you mean').nullable().default(null),
  body: z.string().trim().min(1, 'Say what the message is').max(FREE_TEXT_LIMIT).nullable().default(null),
  composedAt: z.number().int().positive(),
}).refine(
  data => [data.presetId, data.body].filter(value => value !== null).length === 1,
  'Send exactly one of a preset or free text',
)

export type FohMessageInput = z.output<typeof fohMessageForm>

// Which end of the board a message came from, which is the whole of how the FOH screen colours
// its history: FOH's own calls one way, the wings' the other (criterion 7).
export type BoardSide = 'FOH' | 'BACKSTAGE'

export function saysBoardSide(side: BoardSide): string {
  return side === 'FOH' ? 'FOH' : 'Backstage'
}

// Only the latest event in a supersede chain is ever shown: a corrected milestone reads as
// itself, not as two rows (criterion 5).
export function liveBoardMessages<T extends { id: string, supersedesId: string | null }>(messages: T[]): T[] {
  const superseded = new Set(messages.map(message => message.supersedesId).filter((id): id is string => id !== null))
  return messages.filter(message => !superseded.has(message.id))
}

// The two lines the FOH screen leads with: each side's own last call. A night nobody has called
// yet has neither, which is a state the screen says out loud rather than drawing empty.
export function currentBoardState<T extends { side: BoardSide, composedAt: number }>(messages: T[]): { foh: T | null, backstage: T | null } {
  const latestOf = (side: BoardSide): T | null => messages
    .filter(message => message.side === side)
    .reduce<T | null>((latest, message) => latest === null || message.composedAt > latest.composedAt ? message : latest, null)
  return { foh: latestOf('FOH'), backstage: latestOf('BACKSTAGE') }
}

// A correction names a different milestone; nothing else is ever superseded (criterion 5).
export const supersedeMessageForm = z.object({
  milestoneTypeId: z.string().min(1, 'Say which milestone you mean'),
  composedAt: z.number().int().positive(),
})

export type SupersedeMessageInput = z.output<typeof supersedeMessageForm>

const CONFIG_LABEL_LIMIT = 100
const PRESET_BODY_LIMIT = 200

export const milestoneTypeForm = z.object({
  label: z.string().trim().min(1, 'Give it a label').max(CONFIG_LABEL_LIMIT),
  sort: z.number().int(),
})

export type MilestoneTypeInput = z.output<typeof milestoneTypeForm>

export const presetForm = z.object({
  label: z.string().trim().min(1, 'Give it a label').max(CONFIG_LABEL_LIMIT),
  body: z.string().trim().min(1, 'Say what the preset sends').max(PRESET_BODY_LIMIT),
  sort: z.number().int(),
})

export type PresetInput = z.output<typeof presetForm>

// Purged after this many days, milestone events excepted, which are night-report data and
// persist forever (E-122 criterion 4).
export const MESSAGE_RETENTION_DAYS = 30
