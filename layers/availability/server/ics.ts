// Reading an outside calendar (I3): busy and tentative stretches from an iCalendar file, and nothing
// else. Titles, places, attendees and descriptions are never copied out of the parsed file.
import ICAL from 'ical.js'
import { instantOfLocal } from '#kit/clock'
import type { ImportedLevel, TentativeAs } from '../shared/levels'

export interface ReadBlock { from: number, to: number, level: ImportedLevel }
export interface ReadOptions {
  /** The import window, as instants. */
  from: number
  to: number
  /** The theatre's time zone: all-day and floating events are its local days and times. */
  zone: string
  tentativeAs: TentativeAs
  /** I4: true for an event the site itself put in the calendar, by its UID. */
  ours?: (uid: string) => boolean
}

const OCCURRENCES_MAX = 2000 // not-policy: a guard against an unbounded recurrence, well past a year of daily events

type Kind = 'busy' | 'tentative' | 'skip'

const pad = (n: number) => String(n).padStart(2, '0')
const dateOf = (t: ICAL.Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}`

/** An instant for a parsed time: all-day and floating times are read in the theatre's zone. */
function instantOf(t: ICAL.Time, zone: string): number {
  if (t.isDate) return instantOfLocal(dateOf(t), '00:00', zone)
  if (!t.zone || t.zone === ICAL.Timezone.localTimezone) return instantOfLocal(dateOf(t), `${pad(t.hour)}:${pad(t.minute)}`, zone)
  return t.toUnixTime() * 1000 // not-policy: seconds to milliseconds
}

/** The calendar owner's address, where the file names it (Google's private address does). */
function ownerOf(root: ICAL.Component): string | null {
  const name = root.getFirstPropertyValue('x-wr-calname')
  return typeof name === 'string' && name.includes('@') ? name.toLowerCase() : null
}

/** Whether an event makes its time busy, tentative, or nothing (free, cancelled, declined). */
function kindOf(event: ICAL.Component, owner: string | null): Kind {
  const status = String(event.getFirstPropertyValue('status') ?? '').toUpperCase()
  const cdo = String(event.getFirstPropertyValue('x-microsoft-cdo-busystatus') ?? '').toUpperCase()
  if (status === 'CANCELLED' || cdo === 'FREE') return 'skip'
  if (!cdo && String(event.getFirstPropertyValue('transp') ?? '').toUpperCase() === 'TRANSPARENT') return 'skip'
  const mine = owner ? event.getAllProperties('attendee').find(a => String(a.getFirstValue()).toLowerCase() === `mailto:${owner}`) : undefined
  const reply = String(mine?.getParameter('partstat') ?? '').toUpperCase()
  if (reply === 'DECLINED') return 'skip'
  return status === 'TENTATIVE' || cdo === 'TENTATIVE' || reply === 'TENTATIVE' ? 'tentative' : 'busy'
}

/** Every occurrence of a master event (with its moved or changed instances) that overlaps the window. */
function occurrences(event: ICAL.Event, o: ReadOptions): { start: ICAL.Time, end: ICAL.Time, item: ICAL.Event }[] {
  if (!event.isRecurring()) return [{ start: event.startDate, end: event.endDate, item: event }]
  const out: { start: ICAL.Time, end: ICAL.Time, item: ICAL.Event }[] = []
  const it = event.iterator()
  for (let next = it.next(), n = 0; next && n < OCCURRENCES_MAX; next = it.next(), n++) {
    if (instantOf(next, o.zone) >= o.to) break
    const d = event.getOccurrenceDetails(next)
    out.push({ start: d.startDate, end: d.endDate, item: d.item })
  }
  return out
}

/** Each event's master by UID, with its moved or changed instances related to it. */
function mastersOf(root: ICAL.Component): Map<string, ICAL.Event> {
  const vevents = root.getAllSubcomponents('vevent')
  const masters = new Map<string, ICAL.Event>()
  let unnamed = 0
  const uidOf = (v: ICAL.Component) => String(v.getFirstPropertyValue('uid') ?? `#${unnamed++}`)
  for (const v of vevents.filter(v => !v.hasProperty('recurrence-id'))) masters.set(uidOf(v), new ICAL.Event(v))
  for (const v of vevents.filter(v => v.hasProperty('recurrence-id'))) {
    const uid = uidOf(v)
    const master = masters.get(uid)
    if (master) master.relateException(v)
    else masters.set(`${uid}#${unnamed++}`, new ICAL.Event(v))
  }
  return masters
}

/** The level an occurrence gives its time, or null when it gives none. */
function levelOf(kind: Kind, o: ReadOptions): ImportedLevel | null {
  if (kind === 'busy') return 'busy'
  return kind === 'tentative' && o.tentativeAs !== 'ignore' ? o.tentativeAs : null
}

/** One event's blocks within the window. */
function blocksOf(event: ICAL.Event, owner: string | null, o: ReadOptions): ReadBlock[] {
  const out: ReadBlock[] = []
  for (const { start, end, item } of occurrences(event, o)) {
    const level = levelOf(kindOf(item.component, owner), o)
    const from = Math.max(o.from, instantOf(start, o.zone))
    const to = Math.min(o.to, instantOf(end ?? start, o.zone))
    if (level && to > from) out.push({ from, to, level })
  }
  return out
}

/** The busy and maybe stretches of a calendar file within the window, sorted; throws if it is not a calendar. */
export function readCalendar(text: string, o: ReadOptions): ReadBlock[] {
  const root = new ICAL.Component(ICAL.parse(text))
  if (root.name !== 'vcalendar') throw new Error('not a calendar')
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz)
  const owner = ownerOf(root)
  const out: ReadBlock[] = []
  for (const [uid, event] of mastersOf(root)) if (!o.ours?.(uid)) out.push(...blocksOf(event, owner, o))
  return out.sort((a, b) => a.from - b.from || a.to - b.to)
}
