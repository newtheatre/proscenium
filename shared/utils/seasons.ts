import { z } from 'zod'
import { CIVIL_DAY } from './programme'

// The order a show's season is presented in, and the window it runs. A season is a London day
// range (0014): the column is a civil date, never an instant, so no timezone conversion applies.

export const MAX_SEASON_NAME = 120

export const seasonForm = z.object({
  name: z.string().trim().min(1, 'A season needs a name').max(MAX_SEASON_NAME),
  startsOn: z.string().regex(CIVIL_DAY, 'A season needs a start day'),
  endsOn: z.string().regex(CIVIL_DAY, 'A season needs an end day'),
  sort: z.number().int().default(0),
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
  sort: number
  archived: boolean
  // Counted from `shows.season_id`, never stored (D-131 criterion 4).
  inUse: boolean
}
