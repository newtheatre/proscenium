import { daysAfter } from './membership'
import { showNightOf } from './show-night'

// E-109's "tomorrow": the show night after the one an instant falls in, never the calendar day,
// so it agrees with E-110 across a clock change (criterion 2). The read is the server-side twin's.

export function tomorrowsShiftNight(at: Date): string {
  return daysAfter(showNightOf(at), 1)
}
