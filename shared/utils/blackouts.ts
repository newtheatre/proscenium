import { z } from 'zod'
import { overlaps } from './bookings'
import type { Span } from './bookings'

// A room shut for a reason everybody can read (C-114). The old app had no way to say a room was
// closed, so members booked into a get-in and found out on the night (RM-6).

export const BLACKOUT_REASON_LIMIT = 200
export const EVERY_ROOM = null

export interface Blackout extends Span {
  id: string
  roomId: string | null
  reason: string
}

// A blackout with no room is every room, which is what a building closure means.
export function coversRoom(blackout: { roomId: string | null }, roomId: string): boolean {
  return blackout.roomId === null || blackout.roomId === roomId
}

export function blackoutOver(blackouts: Blackout[], roomId: string, span: Span): Blackout | undefined {
  return blackouts.find(blackout => coversRoom(blackout, roomId) && overlaps(blackout, span))
}

// Shown rather than masked: a member turned away deserves to know it is a get-in and not a
// mystery, which is the one deliberate exception to conflict masking (criterion 4, C-103).
export function saysClosed(blackout: { reason: string }): string {
  return `The room is closed then: ${blackout.reason}`
}

const instant = z.string().datetime()

export const blackoutForm = z.object({
  // Null is every room. An empty string would be a room id nobody has.
  roomId: z.string().min(1).max(64).nullish().transform(value => value ?? null),
  reason: z.string().trim().min(1, 'Say why the room is closed').max(BLACKOUT_REASON_LIMIT),
  startsAt: instant,
  endsAt: instant,
}).refine(blackout => new Date(blackout.endsAt) > new Date(blackout.startsAt), {
  path: ['endsAt'],
  message: 'A blackout ends after it starts',
})

export type BlackoutInput = z.output<typeof blackoutForm>
