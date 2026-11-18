// Dates and times as text, the same on every screen: in the theatre's language
// (core.locale.language) and, for an instant, in the theatre's time zone (core.locale.time-zone),
// whatever the viewer's. A value is an instant in milliseconds or a calendar date ("2027-09-01"),
// which has no time zone and is never shifted by one.
import { fromAbsolute, getLocalTimeZone, toCalendarDateTime } from '@internationalized/date'

export type DateInput = number | string | Date

const SHAPES = {
  /** 1 Sept 2027 */
  day: { day: 'numeric', month: 'short', year: 'numeric' },
  /** 1 September 2027 */
  dayLong: { day: 'numeric', month: 'long', year: 'numeric' },
  /** Wed 1 Sept 2027 */
  dayNamed: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
  /** Wed 1 Sept 2027, 19:30 */
  dateTime: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  /** 1 Sept, 19:30: for a chart's axis and other tight places, where the year is plain from what is around it. */
  brief: { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
  /** September 2027: since when, where the day does not matter. */
  monthYear: { month: 'long', year: 'numeric' },
  /** 19:30 */
  time: { hour: '2-digit', minute: '2-digit' },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>
type Shape = keyof typeof SHAPES

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/ // not-policy: a date's shape

export function useDates() {
  const { t } = useT()
  const { data: settings } = usePublicSettings()
  const language = computed(() => (settings.value?.['core.locale.language']?.value as string | undefined) || 'en-GB')
  /** The theatre's zone; undefined until one is set, when the device's own is used. */
  const timeZone = computed(() => (settings.value?.['core.locale.time-zone']?.value as string | undefined) || undefined)

  const formats = computed(() => {
    const make = (zone: string | undefined) => Object.fromEntries(
      (Object.keys(SHAPES) as Shape[]).map(shape => [shape, new Intl.DateTimeFormat(language.value, { ...SHAPES[shape], timeZone: zone })]),
    ) as Record<Shape, Intl.DateTimeFormat>
    return { instant: make(timeZone.value), calendar: make('UTC') }
  })
  function format(shape: Shape, value: DateInput): string {
    if (typeof value === 'string' && CALENDAR_DATE.test(value)) return formats.value.calendar[shape].format(new Date(`${value}T00:00:00Z`))
    return formats.value.instant[shape].format(typeof value === 'string' ? new Date(value) : value)
  }

  const day = (value: DateInput) => format('day', value)
  const dayLong = (value: DateInput) => format('dayLong', value)
  const dayNamed = (value: DateInput) => format('dayNamed', value)
  const dateTime = (value: number | Date) => format('dateTime', value)
  const brief = (value: number | Date) => format('brief', value)
  const monthYear = (value: DateInput) => format('monthYear', value)
  const time = (value: number | Date) => format('time', value)
  /** "1 Sept 2027 to 4 Sept 2027", or one day when both ends fall on the same one. */
  function range(from: DateInput, to: DateInput, shape: 'day' | 'dayLong' | 'dayNamed' | 'dateTime' = 'day'): string {
    const [first, last] = [format(shape, from), format(shape, to)]
    return first === last ? first : t('core.dates.range', { from: first, to: last })
  }

  /** "2–6 Mar 2027": a span of days as short as the language writes it, sharing the month and year where it can. */
  function span(from: DateInput, to: DateInput): string {
    const calendar = typeof from === 'string' && CALENDAR_DATE.test(from)
    const at = (v: DateInput) => typeof v === 'string' ? new Date(CALENDAR_DATE.test(v) ? `${v}T00:00:00Z` : v) : v
    const [first, last] = [format('day', from), format('day', to)]
    return first === last ? first : formats.value[calendar ? 'calendar' : 'instant'].day.formatRange(at(from), at(to))
  }

  /** A month's name from its number, 1 to 12: "August". */
  const monthName = (month: number) => new Intl.DateTimeFormat(language.value, { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2001, month - 1, 1)) // not-policy: any year, to name a month

  /** A day of any year from its month and day: "31 July", as a year end or a year's start reads. */
  const dayOfYear = (month: number, dayOfMonth: number) => new Intl.DateTimeFormat(language.value, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(Date.UTC(2001, month - 1, dayOfMonth)) // not-policy: a year that is not a leap year

  /** The zone the date-time fields work in. */
  const zone = computed(() => timeZone.value ?? getLocalTimeZone())
  /** An instant as a local date and time in the theatre's zone ("2027-09-01T19:30"), as some routes take it. */
  function toLocal(ms: number | null | undefined): string {
    if (ms === null || ms === undefined) return ''
    return toCalendarDateTime(fromAbsolute(ms, zone.value)).toString().slice(0, 16) // not-policy: the length of a date and time to the minute
  }

  return { language, timeZone, zone, monthName, dayOfYear, day, dayLong, dayNamed, dateTime, brief, monthYear, time, range, span, toLocal }
}
