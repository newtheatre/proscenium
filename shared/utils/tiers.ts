import { z } from 'zod'

// Priority between bookings (C-115). The old app published an order and never enforced it, so
// who got a room was decided by argument (RM-1).

export const BUMP_REASON_LIMIT = 500

// The order is configuration, so this takes it rather than knowing it: a committee that reorders
// the tiers reorders the rule, and nothing here needs changing (0012).
export function rankOf(order: readonly string[], tier: string): number {
  const at = order.indexOf(tier)
  // An unknown tier ranks below everything, so a stale booking can never bump a current one.
  return at === -1 ? order.length : at
}

export function outranks(order: readonly string[], mine: string, theirs: string): boolean {
  return rankOf(order, mine) < rankOf(order, theirs)
}

// Why a bump is refused, phrased for the officer doing it. Null means it may go ahead.
export function refusalToBump(
  order: readonly string[],
  displaced: { status: string, tier: string, endsAt: number },
  claimant: { tier: string },
  now: number,
): string | null {
  if (displaced.status !== 'CONFIRMED') return 'Only a confirmed booking can be bumped'
  if (displaced.endsAt <= now) return 'That booking has already happened'
  if (!outranks(order, claimant.tier, displaced.tier)) {
    return 'A booking may only be bumped by a higher priority than its own'
  }
  return null
}

export const bumpForm = z.object({
  // Who the room is being taken for, and what for. A bump is always somebody else's booking.
  userId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(200),
  tier: z.string().min(1).max(32),
  reason: z.string().trim().min(1, 'Say why the room is being taken').max(BUMP_REASON_LIMIT),
})

export type BumpInput = z.output<typeof bumpForm>

export interface Alternative {
  roomId: string
  room: string
  startsAt: number
  endsAt: number
  capacity: number | null
}

// The nearest equivalent slot: the same room first, then a room that holds at least as many,
// closest in time either side (criterion 3).
export function nearest(alternatives: Alternative[], to: number, sameRoom: string): Alternative | undefined {
  const distance = (one: Alternative): number => Math.abs(one.startsAt - to)
  return [...alternatives].sort((a, b) => {
    if (a.roomId === sameRoom && b.roomId !== sameRoom) return -1
    if (b.roomId === sameRoom && a.roomId !== sameRoom) return 1
    return distance(a) - distance(b)
  })[0]
}
