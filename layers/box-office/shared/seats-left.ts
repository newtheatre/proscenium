// How much the public pages say about the seats left (setting availability.seats-left), for the whole
// house on the booking button and for each part of it in Choose tickets. Staff screens always see the count.
export type SeatsLeftLevel = 'count' | 'progress' | 'nearly-full' | 'sold-out'

export interface SeatsLeftRule {
  level: SeatsLeftLevel
  unit: 'share' | 'seats'
  /** Percent of the house, for `share`. */
  share: number
  /** Seats, for `seats`. */
  seats: number
}

/** What a buyer is told: only the facts the level allows, so the count never reaches a page that may not show it. */
export interface SeatsLeftSay {
  state: 'available' | 'limited' | 'sold-out'
  seatsLeft?: number
  sellingFast?: true
}

/** The seats at or under which a house is nearly full: a share rounded up, so a small studio still gets one. */
export function thresholdOf(rule: SeatsLeftRule, capacity: number): number {
  if (rule.unit === 'seats') return rule.seats
  return capacity > 0 ? Math.max(1, Math.ceil(capacity * rule.share / 100)) : 0
}

/** "Selling fast" means half the house or more is gone. */
const SELLING_FAST = 0.5 // not-policy: the meaning of the words, not a rule of the theatre

export function seatsLeftSay(rule: SeatsLeftRule, left: number, capacity: number): SeatsLeftSay {
  if (left <= 0) return { state: 'sold-out' }
  if (rule.level === 'sold-out') return { state: 'available' }
  if (left <= thresholdOf(rule, capacity)) return rule.level === 'count' ? { state: 'limited', seatsLeft: left } : { state: 'limited' }
  if (rule.level === 'progress' && capacity > 0 && left <= capacity * (1 - SELLING_FAST)) return { state: 'available', sellingFast: true }
  return { state: 'available' }
}
