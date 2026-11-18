// What a message says about a shift: the duty, the show or occasion, when to arrive, and the
// details a person needs on the night (where, curtain up, the briefing).
import { first, linkTokens, siteUrl, theatreTimeZone, useSetting, wordsFrom } from '#kit'
import { getPerformance } from '#modules/core'
import catalogue from '../i18n/en-GB.json'
import type { Shift } from './shifts'

/** The module's own strings, for the words the server builds into a message or a calendar file. */
export const say = wordsFrom(catalogue)

export async function formatter() {
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const timeZone = await theatreTimeZone()
  return (at: number) => new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone }).format(at)
}

/** Just the clock time and just the short date, in the theatre's own time zone. */
export async function partFormatters() {
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const timeZone = await theatreTimeZone()
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone })
  const date = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone })
  return { time: (at: number) => time.format(at), date: (at: number) => date.format(at) }
}

export type ShiftWords = { duty: string, show: string, when: string, date: string }

/** The words for one shift: duty, what it is for, the call time and its day (for a subject line). */
export async function shiftWords(shift: Pick<Shift, 'dutyName' | 'title' | 'performanceId' | 'callAt'>): Promise<ShiftWords> {
  const format = await formatter()
  const { date } = await partFormatters()
  const show = shift.performanceId ? (await getPerformance(shift.performanceId)).productionTitle : shift.title ?? ''
  return { duty: shift.dutyName, show, when: format(shift.callAt), date: date(shift.callAt) }
}

/**
 * The lines a person needs beside the call time: where it is, when the curtain goes up, when the
 * shift ends and the briefing. One text variable, because a message variable cannot be left empty.
 */
export async function shiftDetails(shift: Pick<Shift, 'performanceId' | 'venueId' | 'endsAt' | 'briefing'>): Promise<string> {
  const { time } = await partFormatters()
  const lines: string[] = []
  if (shift.performanceId) {
    const performance = await getPerformance(shift.performanceId)
    lines.push(say('front-of-house.shift-details.where', { place: `${performance.venueName}, ${performance.spaceName}` }), say('front-of-house.shift-details.curtain', { time: time(performance.startsAt) }))
  }
  else if (shift.venueId) {
    const venue = await first<{ name: string }>('SELECT name FROM core_venues WHERE id = ?', shift.venueId)
    if (venue) lines.push(say('front-of-house.shift-details.where', { place: venue.name }))
  }
  lines.push(say('front-of-house.shift-details.ends', { time: time(shift.endsAt) }))
  if (shift.briefing) lines.push(say('front-of-house.shift-details.briefing', { briefing: shift.briefing }))
  return lines.join('\n')
}

/** The proof that a link to an assignment's calendar file was made by the server: a keyed hash of the id. */
export function calendarKey(assignmentId: string): Promise<string> {
  return linkTokens.hash(`front-of-house.calendar:${assignmentId}`)
}

/** A link that downloads the one shift as a calendar file, with no sign-in. It opens only that shift. */
export async function calendarLink(assignmentId: string): Promise<string> {
  return siteUrl(`/api/front-of-house/assignments/${encodeURIComponent(assignmentId)}/calendar.ics?k=${encodeURIComponent(await calendarKey(assignmentId))}`)
}
