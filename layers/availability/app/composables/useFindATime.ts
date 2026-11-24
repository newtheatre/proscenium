// Find a time (S7): the organiser's choices, the find they bring back, the days in view, and the people
// at a chosen slot by level. Nothing is stored until a poll is sent (part 2).
import { addDays, clockOf, type Piece } from '../../shared/grid'
import { tally, worstBetween, type Slot, type Span, type Week } from '../../shared/find'
import type { ShownLevel } from '../../shared/levels'

export interface FindOptions {
  today: string
  grid: { step: number, dayStarts: string, dayEnds: string }
  groups: { id: string, label: string, hint?: string }[]
  venues: { id: string, name: string, spaces: { id: string, name: string }[] }[]
}
export interface Found {
  dates: string[]
  step: number
  people: { id: string, name: string, must: boolean }[]
  hidden: number
  weeks: Record<string, Week>
  taken: Record<string, (Span & { label: string | null })[]>
  best: Slot[]
}
export interface Choices { groupIds: string[], period: { start: string, end: string }, hoursFrom: string, hoursTo: string, length: number, spaceIds: string[], roomOptional: boolean, must: string[] }

const PHONE_DAYS = 3 // not-policy: spec part 5, a phone shows few days
const WEEK_DAYS = 7 // not-policy: a week

export async function useFindATime() {
  const { $api } = useNuxtApp()
  const { toRefusal } = useRefusal()
  const options = await useAPI<FindOptions>('/api/availability/find/options', { key: 'availability:find-options' })
  const o = options.data
  const choices = reactive<Choices>({
    groupIds: [],
    period: { start: o.value?.today ?? '', end: o.value ? addDays(o.value.today, WEEK_DAYS - 1) : '' },
    hoursFrom: o.value?.grid.dayStarts ?? '09:00',
    hoursTo: o.value?.grid.dayEnds === '23:59' ? '23:30' : o.value?.grid.dayEnds ?? '23:00',
    length: 120, // not-policy: a first suggestion, changed on the screen
    spaceIds: [],
    roomOptional: false,
    must: [],
  })
  const found = ref<Found | null>(null)
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
  const searching = ref(false)

  async function search() {
    refusal.value = null
    searching.value = true
    try {
      found.value = await $api<Found>('/api/availability/find', {
        method: 'POST',
        body: { groupIds: choices.groupIds, accountIds: [], must: choices.must, from: choices.period.start, to: choices.period.end, hoursFrom: choices.hoursFrom, hoursTo: choices.hoursTo, length: choices.length, spaceIds: choices.spaceIds, roomOptional: choices.roomOptional },
      })
      first.value = 0
    }
    catch (e) {
      refusal.value = toRefusal(e)
    }
    finally {
      searching.value = false
    }
  }

  function toggleMust(id: string) {
    choices.must = choices.must.includes(id) ? choices.must.filter(m => m !== id) : [...choices.must, id]
    void search()
  }

  const phone = useScreenQuery('(max-width: 767px)') // not-policy: Tailwind's md breakpoint
  const length = computed(() => phone.value ? PHONE_DAYS : WEEK_DAYS)
  const first = ref(0)
  const shown = computed(() => found.value?.dates.slice(first.value, first.value + length.value) ?? [])
  const move = (direction: 1 | -1) => {
    const max = Math.max(0, (found.value?.dates.length ?? 0) - length.value)
    first.value = Math.min(max, Math.max(0, first.value + direction * length.value))
  }

  /** Who is at each level over a stretch, with any reason the organiser may read (A7). */
  function at(date: string, start: number, end: number): Record<ShownLevel, { name: string, reason?: string }[]> {
    const out: Record<ShownLevel, { name: string, reason?: string }[]> = { free: [], maybe: [], busy: [], unknown: [] }
    for (const p of found.value?.people ?? []) {
      const pieces: Piece[] = found.value!.weeks[p.id]?.[date] ?? []
      const level = worstBetween(pieces, start, end)
      const reason = pieces.find(x => x.start < end && start < x.end && x.level === level && x.reason)?.reason
      out[level].push({ name: p.name, reason })
    }
    return out
  }

  const counts = (date: string, start: number, end: number) => tally(found.value?.people.map(p => p.id) ?? [], found.value?.weeks ?? {}, date, start, end)
  const mustFails = (date: string, start: number, end: number) => (found.value?.people ?? []).some(p => p.must && worstBetween(found.value!.weeks[p.id]?.[date] ?? [], start, end) !== 'free')
  const takenAt = (date: string, start: number, end: number) => (found.value?.taken[date] ?? []).filter(s => s.start < end && start < s.end)
  const when = (s: { start: number, end: number }) => `${clockOf(s.start)} to ${clockOf(s.end)}`

  /** The times picked for a poll (F7), in date and time order. */
  const picked = ref<{ date: string, start: number, end: number }[]>([])
  const isPicked = (s: { date: string, start: number }) => picked.value.some(p => p.date === s.date && p.start === s.start)
  function pick(s: { date: string, start: number, end: number }) {
    picked.value = isPicked(s)
      ? picked.value.filter(p => !(p.date === s.date && p.start === s.start))
      : [...picked.value, { date: s.date, start: s.start, end: s.end }].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
  }

  return { options, choices, found, refusal, searching, search, toggleMust, shown, first, move, at, counts, mustFails, takenAt, when, picked, isPicked, pick }
}
