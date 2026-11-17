<script setup lang="ts">
// The programme calendar (C-13): performances and closures by month, week or day, for a venue, a
// space or everything, in the theatre's time zone. A show after midnight sits with the evening
// before. The view, the day and the place live in the address, so a calendar is a link.
import { parseDate, today } from '@internationalized/date'
import type { CalendarItem, CalendarView } from '../../../components/CalendarBoard.vue'

interface Performance { id: string, productionId: string, productionTitle: string, label: string | null, venueId: string, spaceId: string, startsAt: number, endsAt: number, operatingDay: string, state: 'draft' | 'scheduled' | 'cancelled' | 'completed' }
interface Closure { id: string, venueId: string | null, spaceId: string | null, kind: 'closure' | 'public_holiday', title: string, startsAt: number, endsAt: number, allDay: boolean, blocksPerformances: boolean, firstDay: string, lastDay: string }
interface Place { id: string, name: string, spaces: { id: string, name: string }[] }

const route = useRoute()
const router = useRouter()
const dates = useDates()
const { data: settings } = usePublicSettings()

const VIEWS: { value: CalendarView, label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
  { value: 'list', label: 'List' },
]
const DATE = /^\d{4}-\d{2}-\d{2}$/ // not-policy: a date's shape
const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined
const view = computed<CalendarView>(() => VIEWS.some(v => v.value === one(route.query.view)) ? one(route.query.view) as CalendarView : 'month')
const day = computed(() => DATE.test(one(route.query.day) ?? '') ? one(route.query.day)! : today(dates.zone.value).toString())
const venueId = computed(() => one(route.query.venue) || undefined)
const spaceId = computed(() => one(route.query.space) || undefined)
function go(change: Record<string, string | undefined>) {
  router.replace({ query: { ...route.query, ...change } })
}

// The days drawn. A month shows the six weeks that hold it, from the theatre's first day of the week.
const FIRST = { sunday: 0, monday: 1, saturday: 6 } as const
const weekStart = computed(() => FIRST[(settings.value?.['core.organisation.week-start']?.value as keyof typeof FIRST | undefined) ?? 'monday'] ?? 1)
const shift = (d: string, days: number) => parseDate(d).add({ days }).toString()
const weekOf = (d: string) => shift(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() - weekStart.value + 7) % 7)) // not-policy: midday, clear of any zone's edge
const days = computed(() => {
  if (view.value === 'day') return [day.value]
  if (view.value === 'week') return Array.from({ length: 7 }, (_, i) => shift(weekOf(day.value), i))
  const first = weekOf(`${day.value.slice(0, 7)}-01`)
  return Array.from({ length: 42 }, (_, i) => shift(first, i)) // not-policy: six weeks
})
const heading = computed(() => {
  if (view.value === 'day') return dates.dayLong(day.value)
  if (view.value === 'week') return dates.range(days.value[0]!, days.value[6]!)
  return dates.monthYear(day.value)
})
const step = (direction: 1 | -1) => {
  const d = parseDate(day.value)
  const next = view.value === 'day' ? d.add({ days: direction }) : view.value === 'week' ? d.add({ weeks: direction }) : d.add({ months: direction })
  go({ day: next.toString() })
}

const query = computed(() => ({ from: days.value[0], to: days.value[days.value.length - 1], venueId: venueId.value, spaceId: spaceId.value }))
const { data, status, error, refresh } = await useAPI<{ performances: Performance[], closures: Closure[], places: Place[] }>('/api/core/calendar', { key: 'core:calendar', query, watch: [query] })

// Where: everything, one venue or one space.
const EVERYWHERE = 'all'
const where = computed(() => spaceId.value ? `${venueId.value}/${spaceId.value}` : venueId.value ?? EVERYWHERE)
const places = computed(() => [
  { value: EVERYWHERE, label: 'Every venue' },
  ...(data.value?.places ?? []).flatMap(v => [
    { value: v.id, label: v.name },
    ...(v.spaces.length > 1 ? v.spaces.map(s => ({ value: `${v.id}/${s.id}`, label: `${v.name}: ${s.name}` })) : []),
  ]),
])
function setWhere(value: string) {
  const [venue, space] = value === EVERYWHERE ? [undefined, undefined] : value.split('/')
  go({ venue, space })
}
function placeName(spaceId: string): string {
  for (const v of data.value?.places ?? []) {
    const s = v.spaces.find(sp => sp.id === spaceId)
    if (s) return s.name.trim().toLowerCase() === v.name.trim().toLowerCase() ? v.name : `${s.name}, ${v.name}`
  }
  return ''
}
const columns = computed(() => (data.value?.places ?? [])
  .filter(v => !venueId.value || v.id === venueId.value)
  .flatMap(v => v.spaces.filter(s => !spaceId.value || s.id === spaceId.value).map(s => ({ id: s.id, label: placeName(s.id) }))))

// A production keeps one of the first seven calendar colours wherever it appears; closures take the eighth.
function colourOf(id: string): CalendarItem['colour'] {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 7 // not-policy: seven colours for productions
  return (hash + 1) as CalendarItem['colour']
}
const STATES = {
  draft: { label: 'Draft', edge: 'dashed' },
  scheduled: { label: 'Scheduled', edge: 'solid' },
  cancelled: { label: 'Cancelled', edge: 'dotted' },
  completed: { label: 'Completed', edge: 'solid' },
} as const
const items = computed<CalendarItem[]>(() => [
  ...(data.value?.performances ?? []).map(p => ({
    id: p.id,
    title: p.label ? `${p.productionTitle} (${p.label})` : p.productionTitle,
    detail: placeName(p.spaceId),
    day: p.operatingDay,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    column: p.spaceId,
    colour: colourOf(p.productionId),
    state: STATES[p.state],
    to: `/console/programme/productions/${p.productionId}`,
  })),
  ...(data.value?.closures ?? []).map(c => ({
    id: c.id,
    title: c.title,
    detail: c.spaceId ? placeName(c.spaceId) : c.venueId ? data.value?.places.find(v => v.id === c.venueId)?.name : 'The whole theatre',
    day: c.firstDay,
    lastDay: c.lastDay,
    ...(c.allDay ? {} : { startsAt: c.startsAt, endsAt: c.endsAt }),
    column: c.spaceId ?? undefined,
    colour: 8 as const,
    state: c.kind === 'public_holiday' ? { label: 'Holiday', edge: 'dashed' as const } : c.blocksPerformances ? { label: 'Closed', edge: 'double' as const } : { label: 'Closure', edge: 'dashed' as const },
  })),
])
</script>

<template>
  <PageFrame
    title="Calendar"
    description="Performances and closures, in the theatre's time zone. A show after midnight sits with the evening before."
    width="full"
  >
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <IconButton
        icon="i-lucide-chevron-left"
        label="Earlier"
        @click="step(-1)"
      />
      <UButton
        label="Today"
        color="neutral"
        variant="outline"
        @click="go({ day: undefined })"
      />
      <IconButton
        icon="i-lucide-chevron-right"
        label="Later"
        @click="step(1)"
      />
      <h2
        class="me-auto text-lg font-semibold"
        aria-live="polite"
      >
        {{ heading }}
      </h2>
      <USelect
        :model-value="where"
        :items="places"
        aria-label="Where"
        class="w-56"
        @update:model-value="setWhere(String($event))"
      />
      <UTabs
        :model-value="view"
        :items="VIEWS"
        :content="false"
        size="sm"
        @update:model-value="go({ view: String($event) })"
      />
    </div>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <CalendarBoard
        :view="view"
        :days="days"
        :month="view === 'month' ? day.slice(0, 7) : undefined"
        :items="items"
        :columns="columns"
        empty="No performances or closures in this period."
        @day="go({ view: 'day', day: $event })"
      />
    </DataBoundary>
  </PageFrame>
</template>
