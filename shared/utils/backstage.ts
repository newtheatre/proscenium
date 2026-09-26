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

// Who a wings phone is, picked rather than typed in the dark (issue 1313). Still only a display
// label: nothing checks it, and something else may be typed instead (E-120 criterion 1).
export const BOARD_LABELS = ['Stage manager', 'Deputy stage manager', 'Lighting', 'Sound', 'Crew'] as const

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

// Front of house sends the same three shapes: its own milestones (House open, Ready to restart)
// feed the night report's timeline beside the wings' (issue 1313, E-121 criterion 7).
export const fohMessageForm = postMessageForm

export type FohMessageInput = z.output<typeof fohMessageForm>

// Which end of the board a message came from, and which end makes a call: the wings are offered
// only their own milestones and presets, front of house only its own (criterion 7, issue 1313).
export const BOARD_SIDES = ['FOH', 'BACKSTAGE'] as const
export type BoardSide = (typeof BOARD_SIDES)[number]

// A call the committee has not placed on an end: a milestone reads as the wings', where every
// milestone sat before calls had an end, and a preset as the foyer's, as the seeded ones read.
export const MILESTONE_DEFAULT_SIDE: BoardSide = 'BACKSTAGE'
export const PRESET_DEFAULT_SIDE: BoardSide = 'FOH'

// The refusal for a call that belongs to the other end of the board (issue 1313).
export function saysOtherEndsCall(side: BoardSide): string {
  return side === 'FOH' ? 'That call is front of house\'s to make' : 'That call is the wings\' to make'
}

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

// What either screen needs of a message to draw it: both ends carry more, neither needs it here.
export interface BoardMessage {
  id: string
  side: BoardSide
  milestoneLabel: string | null
  body: string
  supersedesId: string | null
  composedAt: number
}

export function otherBoardSide(side: BoardSide): BoardSide {
  return side === 'FOH' ? 'BACKSTAGE' : 'FOH'
}

// Both ends lead with the same two calls, read from their own side: own last call first, then
// the other end's (criterion 7, amended 14 September 2026).
export function boardStateFrom<T>(side: BoardSide, state: { foh: T | null, backstage: T | null }): { own: T | null, other: T | null } {
  return side === 'FOH' ? { own: state.foh, other: state.backstage } : { own: state.backstage, other: state.foh }
}

// A send the queue refused, in the words it was typed in (E-121 criterion 6). The preset it
// names may have been retired between the tap and the drain, which is why the fallback exists.
export function saysQueuedSend(
  presets: readonly { id: string, label: string }[],
  payload: { presetId: string | null, body: string | null },
): string {
  const preset = payload.presetId ? presets.find(one => one.id === payload.presetId) : undefined
  const said = preset?.label ?? (payload.body ?? '').trim()
  return said || 'A call to backstage'
}

interface MilestoneCall { id: string, milestoneTypeId: string | null, supersedesId: string | null, composedAt: number }

const latestOf = <T extends { composedAt: number }>(messages: T[]): T | null =>
  messages.reduce<T | null>((latest, message) => latest === null || message.composedAt > latest.composedAt ? message : latest, null)

// One tap for the call this end makes next: the one after its latest live milestone, in the
// committee's order, or the first on a night nobody has called (issue 1313). None after the last.
export function nextCall<T extends { id: string, sort: number }>(types: readonly T[], messages: MilestoneCall[]): T | null {
  const ordered = [...types].sort((a, b) => a.sort - b.sort)
  const ours = new Set(ordered.map(type => type.id))
  const latest = latestOf(liveBoardMessages(messages).filter(message => message.milestoneTypeId !== null && ours.has(message.milestoneTypeId)))
  if (!latest) return ordered[0] ?? null
  return ordered[ordered.findIndex(type => type.id === latest.milestoneTypeId) + 1] ?? null
}

// A mis-tapped milestone is changed by its own end until anybody calls the next one: then the
// earlier call is what the evening passed through (E-121 criterion 5, issue 1313).
export function correctableMilestone<T extends MilestoneCall & { side: BoardSide }>(side: BoardSide, messages: T[]): T | null {
  const latest = latestOf(liveBoardMessages(messages).filter(message => message.milestoneTypeId !== null))
  return latest?.side === side ? latest : null
}

export interface BoardFeedRow<T> { message: T, seenAt: number | null }

// The history either end shows: live rows only, each carrying the other side's first tick.
export function boardFeedRows<T extends { id: string, supersedesId: string | null }>(
  messages: T[],
  seen: { messageId: string, seenAt: number }[],
): BoardFeedRow<T>[] {
  const seenAt = new Map(seen.map(row => [row.messageId, row.seenAt]))
  return liveBoardMessages(messages).map(message => ({ message, seenAt: seenAt.get(message.id) ?? null }))
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
  side: z.enum(BOARD_SIDES).default(MILESTONE_DEFAULT_SIDE),
})

export type MilestoneTypeInput = z.output<typeof milestoneTypeForm>

export const presetForm = z.object({
  label: z.string().trim().min(1, 'Give it a label').max(CONFIG_LABEL_LIMIT),
  body: z.string().trim().min(1, 'Say what the preset sends').max(PRESET_BODY_LIMIT),
  sort: z.number().int(),
  side: z.enum(BOARD_SIDES).default(PRESET_DEFAULT_SIDE),
})

export type PresetInput = z.output<typeof presetForm>

// Purged after this many days, milestone events excepted, which are night-report data and
// persist forever (E-122 criterion 4).
export const MESSAGE_RETENTION_DAYS = 30
