// Working out levels (rule A4): for each instant, the exception entered most recently that covers
// it; else an imported calendar block (busy beats maybe); else the line of the pattern whose dates
// cover the day; else what unmarked time means.
// Nothing is stored per slot, so a change shows everywhere at once.
import { instantOfLocal, localDateOf } from '#kit/clock'
import { minutesOf, type ImportedLevel, type Level, type ShownLevel } from '../shared/levels'

export interface LineRow { patternId: string, startsOn: string, endsOn: string | null, changedAt: number, weekday: number, from: string, until: string, level: Level }
export interface ExceptionRow { id: string, firstDate: string, lastDate: string, weekdays: number[] | null, from: string | null, until: string | null, level: Level, reason: string | null, reasonShared: boolean, createdAt: number }
/** An imported block cut to one local day, with its connection's label for the person alone (I6). */
export interface ImportSpan { start: number, end: number, level: ImportedLevel, label: string }
export interface DayRows { lines: LineRow[], exceptions: ExceptionRow[], imported?: Record<string, ImportSpan[]> }
export interface DayOptions { unmarked: ShownLevel, showReason: (e: ExceptionRow) => boolean, /** The person themselves, who sees where imported time came from. */ own?: boolean }
export interface Block { from: number, to: number, level: ShownLevel, reason?: string }

const DAY_MINUTES = 1440 // not-policy: minutes in a day

/** Monday 1 to Sunday 7 of a YYYY-MM-DD date. */
export function weekdayOf(date: string): number {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay()
  return d === 0 ? 7 : d // not-policy: Sunday is 7
}

export function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10) // not-policy: a day
}

const span = (from: string | null, until: string | null): [number, number] => from && until ? [minutesOf(from), minutesOf(until)] : [0, DAY_MINUTES]

interface Piece { start: number, end: number, level: ShownLevel, reason?: string, imported?: string }

/** The imported span ruling a stretch: busy beats maybe where blocks overlap (I3). */
const importedAt = (spans: ImportSpan[], start: number, end: number) => spans.filter(x => x.start <= start && end <= x.end).sort((a, b) => (a.level === 'busy' ? 0 : 1) - (b.level === 'busy' ? 0 : 1))[0]

/** One local day's pieces, in minutes past midnight, adjacent equal pieces joined. */
export function resolveDay(date: string, rows: DayRows, o: DayOptions): Piece[] {
  const { lines, exceptions } = rows
  const imported = rows.imported?.[date] ?? []
  const weekday = weekdayOf(date)
  const covering = exceptions
    .filter(e => e.firstDate <= date && date <= e.lastDate && (!e.weekdays || e.weekdays.includes(weekday)))
    .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1))
  const pattern = lines.filter(l => l.startsOn <= date && (l.endsOn === null || date <= l.endsOn))
  // Overlapping patterns only arise from a merge read through the scope: the latest changed wins.
  const newest = pattern.reduce((m, l) => Math.max(m, l.changedAt), 0)
  const today = pattern.filter(l => l.changedAt === newest && l.weekday === weekday)
  const cuts = new Set([0, DAY_MINUTES])
  for (const e of covering) span(e.from, e.until).forEach(m => cuts.add(m))
  for (const l of today) span(l.from, l.until).forEach(m => cuts.add(m))
  for (const x of imported) [x.start, x.end].forEach(m => cuts.add(m))
  const points = [...cuts].sort((a, b) => a - b)
  const out: Piece[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const [start, end] = [points[i]!, points[i + 1]!]
    const inside = ([a, b]: [number, number]) => a <= start && end <= b
    const e = covering.find(x => inside(span(x.from, x.until)))
    const im = e ? undefined : importedAt(imported, start, end)
    const l = e || im ? undefined : today.find(x => inside(span(x.from, x.until)))
    const piece: Piece = { start, end, level: e?.level ?? im?.level ?? l?.level ?? o.unmarked }
    if (e?.reason && o.showReason(e)) piece.reason = e.reason
    if (im && o.own) piece.imported = im.label
    const last = out[out.length - 1]
    if (last && last.level === piece.level && last.reason === piece.reason && last.imported === piece.imported) last.end = end
    else out.push(piece)
  }
  return out
}

/** A person's blocks over [from, to), as instants in the theatre's time zone. */
export function blocksBetween(input: { from: number, to: number, zone: string, rows: DayRows, unmarked: ShownLevel, showReason: (e: ExceptionRow) => boolean }): Block[] {
  const out: Block[] = []
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` // not-policy: minutes to HH:MM
  const lastDate = localDateOf(input.to - 1, input.zone)
  for (let date = localDateOf(input.from, input.zone); date <= lastDate; date = nextDate(date)) {
    for (const p of resolveDay(date, input.rows, { unmarked: input.unmarked, showReason: input.showReason })) {
      const from = Math.max(input.from, instantOfLocal(date, clock(p.start), input.zone))
      const to = Math.min(input.to, instantOfLocal(date, clock(p.end), input.zone))
      if (to <= from) continue
      const last = out[out.length - 1]
      if (last && last.to === from && last.level === p.level && last.reason === p.reason) last.to = to
      else out.push({ from, to, level: p.level, ...(p.reason ? { reason: p.reason } : {}) })
    }
  }
  return out
}
