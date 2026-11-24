// The rota grid's state (FH-48): the filters, kept in the address; the grid itself; and the cells picked.
import { parseDate, today } from '@internationalized/date'
import { GRID_ANY, type GridCell, type GridChoices, type GridVenue, type RotaGrid } from '../utils/rota-grid'

const FORTNIGHT = 13 // not-policy: the nights shown after the first, when none are chosen

export async function useRotaGrid() {
  const dates = useDates()
  const route = useRoute()
  const router = useRouter()

  const plusDays = (day: string, n: number) => parseDate(day).add({ days: n }).toString()
  const queryText = (key: string) => (route.query[key] as string | undefined) || undefined
  const replace = (changes: Record<string, string | undefined>) => { void router.replace({ query: { ...route.query, ...changes } }) }

  const range = computed({
    get: () => {
      const start = queryText('from') ?? today(dates.zone.value).toString()
      return { start, end: queryText('to') ?? plusDays(start, FORTNIGHT) }
    },
    set: (v: { start: string, end: string }) => replace({ from: v.start || undefined, to: v.end || v.start || undefined }),
  })
  const choose = (key: string) => computed({
    get: () => queryText(key) ?? GRID_ANY,
    set: (v: string) => replace({ [key]: v === GRID_ANY ? undefined : v }),
  })
  const crewCall = choose('call')
  const venue = choose('venue')
  const duty = choose('duty')
  const unfilled = computed({
    get: () => route.query.unfilled === '1',
    set: (v: boolean) => replace({ unfilled: v ? '1' : undefined }),
  })
  const chosen = (v: string) => v === GRID_ANY ? undefined : v
  const query = computed(() => ({
    from: range.value.start,
    to: range.value.end,
    crewCallId: chosen(crewCall.value),
    venueId: chosen(venue.value),
    dutyId: chosen(duty.value),
    unfilled: unfilled.value ? '1' : undefined,
  }))

  // Both start before either is awaited: after an await the Nuxt context is gone.
  const [{ data, status, error, refresh }, { data: choices }] = await Promise.all([
    useAPI<RotaGrid>('/api/front-of-house/grid', { key: 'front-of-house:grid', query }),
    useAPI<GridChoices>('/api/front-of-house/choices', { key: 'front-of-house:choices' }),
  ])

  // Every venue in view gets its own line, so a venue with nothing yet can still be picked.
  const venues = computed<GridVenue[]>(() => (choices.value?.venues ?? [])
    .filter(v => venue.value === GRID_ANY || v.id === venue.value)
    .map(v => ({
      ...v,
      rows: (data.value?.rows ?? []).filter(r => r.venueId === v.id),
      performances: Object.fromEntries((data.value?.performances ?? []).filter(p => p.venueId === v.id).map(p => [p.day, p])),
    })))

  const picked = ref<GridCell[]>([])
  const same = (a: GridCell, b: GridCell) => a.venueId === b.venueId && a.dutyId === b.dutyId && a.day === b.day
  const isPicked = (c: GridCell) => picked.value.some(p => same(p, c))
  const togglePick = (c: GridCell) => {
    picked.value = isPicked(c) ? picked.value.filter(p => !same(p, c)) : [...picked.value, c]
  }
  watch(query, () => { picked.value = [] })

  return { range, crewCall, venue, duty, unfilled, query, data, status, error, refresh, choices, venues, picked, isPicked, togglePick }
}
