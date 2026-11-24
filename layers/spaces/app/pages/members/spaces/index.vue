<!-- Room bookings calendar (spec part 5, "Calendar"; SP-14): the rooms this person may see, by day
     with rooms side by side, by week, or as a list. Others' bookings say only what rule K2 allows;
     the person's own requests show as outlines. The view, the day and the rooms live in the address. -->
<script setup lang="ts">
import { parseDate, today } from '@internationalized/date'

type View = 'day' | 'week' | 'list'
interface BoardItem { id: string, title: string, detail?: string, day: string, lastDay?: string, startsAt: number, endsAt: number, column?: string, colour: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, state: { label: string, edge: 'solid' | 'dashed' | 'double', usual?: boolean }, to?: string }
interface Bookable { id: string, name: string, kind: 'space' | 'resource', venueName: string | null, colour: string | null, external: boolean, request: boolean, staff: boolean }
interface Item { kind: 'booking' | 'request' | 'performance' | 'closure' | 'holiday', id: string, bookableId: string | null, startsAt: number, endsAt: number, purpose?: string, title?: string, bookedBy?: string, mine: boolean, day: string, lastDay: string }

const route = useRoute()
const router = useRouter()
const dates = useDates()
const { t } = useT()

const VIEWS = computed(() => (['day', 'week', 'list'] as const).map(value => ({ value, label: t(`spaces.calendar.views.${value}`) })))
const DATE = /^\d{4}-\d{2}-\d{2}$/ // not-policy: a date's shape
const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined
const view = computed<View>(() => (['day', 'week', 'list'] as string[]).includes(one(route.query.view) ?? '') ? one(route.query.view) as View : 'day')
const day = computed(() => DATE.test(one(route.query.day) ?? '') ? one(route.query.day)! : today(dates.zone.value).toString())
const chosen = computed(() => (one(route.query.rooms) ?? '').split(',').filter(Boolean))
function go(change: Record<string, string | undefined>) {
  router.replace({ query: { ...route.query, ...change } })
}

const shift = (d: string, days: number) => parseDate(d).add({ days }).toString()
const weekOf = (d: string) => shift(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7)) // not-policy: midday, clear of any zone's edge; weeks from Monday
const days = computed(() => view.value === 'day' ? [day.value] : Array.from({ length: 7 }, (_, i) => shift(weekOf(day.value), i)))
const heading = computed(() => view.value === 'day' ? dates.dayLong(day.value) : dates.range(days.value[0]!, days.value[6]!))
const step = (direction: 1 | -1) => go({ day: parseDate(day.value).add(view.value === 'day' ? { days: direction } : { weeks: direction }).toString() })

const query = computed(() => ({ from: days.value[0], to: days.value[days.value.length - 1], bookables: chosen.value.join(',') || undefined }))
const { data, status, error, refresh } = await useAPI<{ bookables: Bookable[], items: Item[] }>('/api/spaces/calendar', { key: 'spaces:calendar', query, watch: [query] })

const roomItems = computed(() => (data.value?.bookables ?? []).map(b => ({ value: b.id, label: b.name })))
const shown = computed(() => {
  const all = data.value?.bookables ?? []
  return chosen.value.length ? all.filter(b => chosen.value.includes(b.id)) : all
})
const canBook = computed(() => (data.value?.bookables ?? []).some(b => b.request))
const nameOf = (id: string | null) => data.value?.bookables.find(b => b.id === id)?.name ?? ''

function colourOf(bookableId: string | null): BoardItem['colour'] {
  const set = data.value?.bookables.find(b => b.id === bookableId)?.colour
  if (set) return Number(set.slice(-1)) as BoardItem['colour']
  let hash = 0
  for (const ch of bookableId ?? '') hash = (hash * 31 + ch.charCodeAt(0)) % 7 // not-policy: seven colours for rooms
  return (hash + 1) as BoardItem['colour']
}
const STATE = computed(() => ({
  booking: { label: t('spaces.calendar.states.booked'), edge: 'solid' as const, usual: true },
  mine: { label: t('spaces.calendar.states.yours'), edge: 'solid' as const },
  request: { label: t('spaces.calendar.states.requested'), edge: 'dashed' as const },
  performance: { label: t('spaces.calendar.states.performance'), edge: 'double' as const },
  closure: { label: t('spaces.calendar.states.closed'), edge: 'double' as const },
  holiday: { label: t('spaces.calendar.states.holiday'), edge: 'dashed' as const },
}))
const items = computed<BoardItem[]>(() => (data.value?.items ?? []).map((i) => {
  const what = i.kind === 'performance' || i.kind === 'closure' || i.kind === 'holiday'
    ? i.title ?? ''
    : [i.purpose, i.title].filter(Boolean).join(': ') || t('spaces.calendar.booked')
  return {
    id: `${i.kind}:${i.id}:${i.bookableId ?? ''}`,
    title: what,
    detail: [i.kind === 'holiday' ? null : nameOf(i.bookableId), i.bookedBy].filter(Boolean).join(' · ') || undefined,
    day: i.day,
    lastDay: i.lastDay !== i.day ? i.lastDay : undefined,
    startsAt: i.startsAt,
    endsAt: i.endsAt,
    column: i.bookableId ?? undefined,
    colour: i.kind === 'closure' || i.kind === 'holiday' ? 8 : colourOf(i.bookableId),
    state: STATE.value[i.kind === 'booking' && i.mine ? 'mine' : i.kind],
    to: i.mine ? `/members/spaces/bookings/${i.id}` : undefined,
  }
}))
const columns = computed(() => shown.value.map(b => ({ id: b.id, label: b.name })))
</script>

<template>
  <PageFrame
    :title="t('spaces.calendar.title')"
    :description="t('spaces.calendar.description')"
    width="full"
  >
    <template #primary>
      <UButton
        v-if="canBook"
        to="/members/spaces/book"
        icon="i-lucide-plus"
        :label="t('spaces.calendar.book')"
      />
    </template>
    <template #toolbar>
      <div class="flex flex-wrap items-center gap-2">
        <IconButton
          icon="i-lucide-chevron-left"
          :label="t('spaces.calendar.earlier')"
          @click="step(-1)"
        />
        <UButton
          :label="t('spaces.calendar.today')"
          color="neutral"
          variant="outline"
          @click="go({ day: undefined })"
        />
        <IconButton
          icon="i-lucide-chevron-right"
          :label="t('spaces.calendar.later')"
          @click="step(1)"
        />
        <h2
          class="me-auto text-lg font-semibold"
          aria-live="polite"
        >
          {{ heading }}
        </h2>
        <USelectMenu
          :model-value="chosen"
          :items="roomItems"
          value-key="value"
          multiple
          :placeholder="t('spaces.calendar.every-room')"
          :aria-label="t('spaces.calendar.rooms')"
          class="w-64"
          @update:model-value="go({ rooms: ($event as string[]).join(',') || undefined })"
        />
        <UTabs
          :model-value="view"
          :items="VIEWS"
          :content="false"
          size="sm"
          @update:model-value="go({ view: String($event) })"
        />
        <UButton
          to="/members/spaces/bookings"
          color="neutral"
          variant="ghost"
          icon="i-lucide-list"
          :label="t('spaces.calendar.mine')"
        />
      </div>
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <EmptyState
          v-if="!d.bookables.length"
          icon="i-lucide-calendar-clock"
          :title="t('spaces.calendar.no-rooms')"
        />
        <CalendarBoard
          v-else
          :view="view"
          :days="days"
          :items="items"
          :columns="columns"
          :empty="t('spaces.calendar.empty')"
          @day="go({ view: 'day', day: $event })"
        />
      </template>
    </DataBoundary>
  </PageFrame>
</template>
