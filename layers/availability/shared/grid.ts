// The week grid's arithmetic (spec part 5, "How the grid reads"), shared by its screens: rows on the
// grid step, the level under a cell, and dates moved by whole days.
import { minutesOf, type Level, type ShownLevel } from './levels'

export const DAY_MINUTES = 1440 // not-policy: minutes in a day

/** `commitment` is the translation key of what holds the person elsewhere (F4), never a name. */
export interface Piece { start: number, end: number, level: ShownLevel, reason?: string, commitment?: string, /** The person's own calendar connection's label, shown to them alone (I6). */ imported?: string }
export interface Day { date: string, pieces: Piece[] }
/** A5: a stretch another module holds a person to; `labelKey` is a translation key. */
export interface Commitment { start: number, end: number, labelKey: string, firm: boolean }

/** "HH:MM" for minutes past midnight, "24:00" at the end of the day. */
export function clockOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` // not-policy: minutes in an hour
}

/** The start of each row, in minutes past midnight. */
export const rowStarts = (step: number) => Array.from({ length: Math.ceil(DAY_MINUTES / step) }, (_, i) => i * step)

/** The piece a cell starting at `minute` falls in. */
export const pieceAt = (pieces: Piece[], minute: number): Piece | undefined => pieces.find(p => p.start <= minute && minute < p.end)

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10) // not-policy: midday, clear of any zone's edge
}

/** The Monday of the week a date is in. */
export const mondayOf = (date: string) => addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7)) // not-policy: weeks from Monday

/** One line of a weekly pattern: a stretch of a weekday at one level. */
export interface Line { weekday: number, from: string, until: string, level: Level }

export interface Span { start: number, end: number }
export const spanOf = (from: string | null, until: string | null): Span => from && until ? { start: minutesOf(from), end: minutesOf(until) } : { start: 0, end: DAY_MINUTES }

/** What is left of `span` once `cut` is taken out: nothing, one piece or two. */
export function without(span: Span, cut: Span): Span[] {
  if (cut.end <= span.start || span.end <= cut.start) return [span]
  return [{ start: span.start, end: cut.start }, { start: cut.end, end: span.end }].filter(s => s.end > s.start)
}

/** A weekday's lines with the stroke painted over them, neighbours of one level joined. */
export function repaint(lines: Line[], weekday: number, cut: Span, level: Level | 'clear'): Line[] {
  const others = lines.filter(l => l.weekday !== weekday)
  const day = lines.filter(l => l.weekday === weekday).flatMap(l => without(spanOf(l.from, l.until), cut).map(s => ({ ...s, level: l.level })))
  if (level !== 'clear') day.push({ ...cut, level })
  day.sort((a, b) => a.start - b.start)
  const joined: (Span & { level: Level })[] = []
  for (const s of day) {
    const last = joined[joined.length - 1]
    if (last && last.end === s.start && last.level === s.level) last.end = s.end
    else joined.push({ ...s })
  }
  return [...others, ...joined.map(s => ({ weekday, from: clockOf(s.start), until: clockOf(s.end), level: s.level }))]
}
