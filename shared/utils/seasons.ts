import { z } from 'zod'
import { CIVIL_DAY } from './programme'

// One of the theatre's seasons and the days it runs (0087). A season is a London day range
// (0014): the column is a civil date, never an instant, so no timezone conversion applies.

export const MAX_SEASON_NAME = 120

export const seasonForm = z.object({
  name: z.string().trim().min(1, 'A season needs a name').max(MAX_SEASON_NAME),
  startsOn: z.string().regex(CIVIL_DAY, 'A season needs a start day'),
  endsOn: z.string().regex(CIVIL_DAY, 'A season needs an end day'),
}).strict().refine(input => input.endsOn > input.startsOn, {
  message: 'A season ends after it starts',
  path: ['endsOn'],
})

export const archiveSeasonForm = z.object({ archived: z.boolean() }).strict()

export type SeasonInput = z.output<typeof seasonForm>

export interface AdminSeason {
  id: string
  name: string
  startsOn: string
  endsOn: string
  archived: boolean
  // Counted from `shows.season_id`, never stored (D-131 criterion 4).
  inUse: boolean
}

// An overlap is guidance, never a refusal (0087): the money dashboard counts a shared day twice.
export function saysOverlaps(names: readonly string[]): string | null {
  if (names.length === 0) return null
  const listed = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `Its days overlap ${listed}. The money dashboard counts a shared day in both.`
}
