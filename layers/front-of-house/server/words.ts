// What a message says about a shift: the duty, the show or occasion, and when to arrive.
import { theatreTimeZone, useSetting } from '#kit'
import { getPerformance } from '#modules/core'
import type { Shift } from './shifts'

export async function formatter() {
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const timeZone = await theatreTimeZone()
  return (at: number) => new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone }).format(at)
}

/** The words for one shift: duty, what it is for, and the call time. */
export async function shiftWords(shift: Pick<Shift, 'dutyName' | 'title' | 'performanceId' | 'callAt'>): Promise<{ duty: string, show: string, when: string }> {
  const format = await formatter()
  const show = shift.performanceId ? (await getPerformance(shift.performanceId)).productionTitle : shift.title ?? ''
  return { duty: shift.dutyName, show, when: format(shift.callAt) }
}
