// The theatre's rule for how much the public pages say about seats left; the wording is in shared/seats-left.ts.
import { useSetting } from '#kit'
import type { SeatsLeftLevel, SeatsLeftRule } from '../shared/seats-left'

export { seatsLeftSay, type SeatsLeftSay } from '../shared/seats-left'

export async function seatsLeftRule(): Promise<SeatsLeftRule> {
  const [level, unit, share, seats] = await Promise.all([
    useSetting('box-office.availability.seats-left'),
    useSetting('box-office.availability.threshold-unit'),
    useSetting('box-office.availability.threshold-share'),
    useSetting('box-office.availability.show-remaining-under'),
  ])
  return { level: level as SeatsLeftLevel, unit: unit as 'share' | 'seats', share: share as number, seats: seats as number }
}
