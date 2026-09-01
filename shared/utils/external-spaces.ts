import { z } from 'zod'

// Rooms the Students' Union manages, and what we learned about them (C-119). We cannot promise a
// room we do not control, so a space is a reference rather than a bookable thing.

export const SPACE_NOTE_REASON_LIMIT = 500

export const VERDICTS = ['SUITABLE', 'CAUTION', 'UNSUITABLE'] as const
export type Verdict = (typeof VERDICTS)[number]

export interface SpaceNote {
  spaceId: string
  purpose: string
  verdict: Verdict
  reason: string
}

// One verdict per space per purpose, so this finds at most one. A space with a note about
// rehearsals says nothing about meetings, which is the point of keying on both.
export function noteFor(notes: SpaceNote[], spaceId: string, purpose: string | null): SpaceNote | undefined {
  if (!purpose) return undefined
  return notes.find(note => note.spaceId === spaceId && note.purpose === purpose)
}

// What a member or an officer is told. Null is silence: only a note worth acting on speaks.
export function warningFor(note: SpaceNote | undefined): string | null {
  if (!note || note.verdict === 'SUITABLE') return null
  const lead = note.verdict === 'UNSUITABLE' ? 'This room is no good for that' : 'This room may not suit that'
  return `${lead}: ${note.reason}`
}

// An unsuitable verdict is the one an officer must assert past rather than merely read, because
// the whole complaint is that nobody knew until they turned up to the room.
export function blocksAssignment(note: SpaceNote | undefined): boolean {
  return note?.verdict === 'UNSUITABLE'
}

export function saysVerdict(verdict: string): string {
  if (verdict === 'UNSUITABLE') return 'No good for'
  if (verdict === 'CAUTION') return 'May not suit'
  return 'Fine for'
}

export const spaceForm = z.object({
  name: z.string().trim().min(1, 'Give the room a name people would recognise').max(120),
  campus: z.string().trim().max(120).nullish().transform(value => (value ?? '').trim() || null),
  building: z.string().trim().max(120).nullish().transform(value => (value ?? '').trim() || null),
  contact: z.string().trim().max(200).nullish().transform(value => (value ?? '').trim() || null),
  capacity: z.number().int().positive().nullish().transform(value => value ?? null),
  isActive: z.boolean().default(true),
})

export const spaceNoteForm = z.object({
  purpose: z.string().trim().min(1, 'Say which purpose this is about').max(32),
  verdict: z.enum(VERDICTS),
  reason: z.string().trim().min(1, 'Say what is wrong with it').max(SPACE_NOTE_REASON_LIMIT),
})

export type SpaceInput = z.output<typeof spaceForm>
export type SpaceNoteInput = z.output<typeof spaceNoteForm>
