import { committeeYearOf } from './london'

// The season a treasurer means by "now" (I-105 criterion 4): 1 August to 31 July, named by the
// year it ends in, same rule as the committee year (0009). One definition, not a second formula.
export function currentSeasonYear(): number {
  return committeeYearOf(new Date())
}
