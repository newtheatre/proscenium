import { saysClock, saysDayLong } from './when'
import type { When } from './when'

// What a rooms email says for a slot: the day once, then both ends, because "at 18:00" left
// the member guessing how long they had the room. A message is kept, so it always names the year.
export function saysRoomSpan(from: When, to: When): string {
  const start = saysDayLong(from, { year: true })
  const end = saysDayLong(to, { year: true })
  return start === end
    ? `${start}, ${saysTimes(from, to)}`
    : `${start}, ${saysClock(from)} to ${end}, ${saysClock(to)}`
}

export function saysTimes(from: When, to: When): string {
  return `${saysClock(from)} to ${saysClock(to)}`
}
