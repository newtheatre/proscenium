<!-- The shared calendar (UI-35): every module that shows time draws it with this, never its own.
     Month, week and day views, and a List view of the same items that is the equal route and the
     one shown at phone width. Items are placed on the operating day they belong to, so a block that
     crosses midnight is drawn once, on its night. Each block shows its state three ways: a word, an
     edge style and a colour, the colour one of the eight named calendar colours. -->
<script setup lang="ts">
export interface CalendarItem {
  id: string
  title: string
  /** A second line, such as the space. */
  detail?: string
  /** The operating day it belongs to, YYYY-MM-DD. */
  day: string
  /** For an item over several days, the last one it touches. */
  lastDay?: string
  /** Absent for an all-day item. */
  startsAt?: number
  endsAt?: number
  /** The day view's column it sits in; absent for one that spans every column. */
  column?: string
  /** One of the eight calendar colours, 1 to 8. */
  colour: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  /** The state in words, and the edge that goes with it. */
  state: { label: string, edge: 'solid' | 'dashed' | 'dotted' | 'double' }
  /** Where acting on the block goes: the record's page. */
  to?: string
}
export type CalendarView = 'month' | 'week' | 'day' | 'list'

const props = withDefaults(defineProps<{
  view: CalendarView
  /** The days drawn, in order: six weeks for a month, seven for a week, one for a day. */
  days: string[]
  /** The month being shown, YYYY-MM, so days outside it are dimmed. */
  month?: string
  items: CalendarItem[]
  /** The day view's columns, such as spaces. */
  columns?: { id: string, label: string }[]
  /** What the list says when there is nothing. */
  empty?: string
}>(), { month: undefined, columns: () => [], empty: 'Nothing in this period.' })

const emit = defineEmits<{ day: [day: string] }>()
const dates = useDates()

// An item belongs to every day from its day to its last one.
const covers = (item: CalendarItem, day: string) => item.day <= day && day <= (item.lastDay ?? item.day)
const ordered = computed(() => [...props.items].sort((a, b) => (a.startsAt === undefined ? -1 : 0) - (b.startsAt === undefined ? -1 : 0) || (a.startsAt ?? 0) - (b.startsAt ?? 0) || a.title.localeCompare(b.title)))
const on = (day: string) => ordered.value.filter(i => covers(i, day))
const when = (item: CalendarItem) => item.startsAt === undefined ? 'All day' : `${dates.time(item.startsAt)}${item.endsAt ? `–${dates.time(item.endsAt)}` : ''}`
const edge = { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted', double: 'border-double border-4' } as const

const MONTH_SHOWS = 3 // not-policy: blocks in a month cell before "more"
const weekdays = computed(() => props.days.slice(0, 7))
const listDays = computed(() => props.days.filter(d => on(d).length))

// The day view on a phone shows one column, chosen from a menu.
const day = computed(() => props.days[0] ?? '')
const spanning = computed(() => on(day.value).filter(i => !i.column))
const chosen = ref<string | undefined>(undefined)
watch(() => props.columns, (cols) => {
  if (!cols.some(c => c.id === chosen.value)) chosen.value = cols[0]?.id
}, { immediate: true })
</script>

<template>
  <div>
    <!-- The List view: always at phone width for the month and week, and wherever it is chosen. -->
    <div
      :class="view === 'list' ? '' : (view === 'day' ? 'hidden' : 'sm:hidden')"
      class="space-y-4"
    >
      <p
        v-if="!listDays.length"
        class="text-muted"
      >
        {{ empty }}
      </p>
      <section
        v-for="d in listDays"
        :key="d"
        :aria-label="dates.dayLong(d)"
      >
        <h3 class="mb-2 text-sm font-semibold">
          {{ dates.dayNamed(d) }}
        </h3>
        <ul class="space-y-2">
          <li
            v-for="item in on(d)"
            :key="item.id"
          >
            <CalendarBlock
              :item="item"
              :when="when(item)"
              :edge="edge[item.state.edge]"
            />
          </li>
        </ul>
      </section>
    </div>

    <!-- Month -->
    <div
      v-if="view === 'month'"
      class="hidden sm:block"
    >
      <div
        class="grid grid-cols-7 border-b border-default text-xs font-medium text-muted"
        aria-hidden="true"
      >
        <div
          v-for="d in weekdays"
          :key="d"
          class="px-2 py-1"
        >
          {{ dates.dayNamed(d).split(/[ ,]/)[0] }}
        </div>
      </div>
      <ol class="grid grid-cols-7 border-s border-default">
        <li
          v-for="d in days"
          :key="d"
          class="min-h-28 border-e border-b border-default p-1"
          :class="month && !d.startsWith(month) ? 'bg-elevated/50' : ''"
        >
          <UButton
            :label="String(Number(d.slice(8)))"
            :aria-label="dates.dayLong(d)"
            variant="ghost"
            color="neutral"
            size="xs"
            :class="month && !d.startsWith(month) ? 'text-muted' : ''"
            @click="emit('day', d)"
          />
          <ul class="mt-1 space-y-1">
            <li
              v-for="item in on(d).slice(0, MONTH_SHOWS)"
              :key="item.id"
            >
              <CalendarBlock
                :item="item"
                :when="when(item)"
                :edge="edge[item.state.edge]"
                compact
              />
            </li>
          </ul>
          <UButton
            v-if="on(d).length > MONTH_SHOWS"
            :label="`${on(d).length - MONTH_SHOWS} more`"
            variant="link"
            color="neutral"
            size="xs"
            @click="emit('day', d)"
          />
        </li>
      </ol>
    </div>

    <!-- Week -->
    <ol
      v-else-if="view === 'week'"
      class="hidden gap-2 sm:grid sm:grid-cols-7"
    >
      <li
        v-for="d in days"
        :key="d"
        class="min-w-0"
      >
        <UButton
          :label="dates.dayNamed(d)"
          variant="ghost"
          color="neutral"
          size="xs"
          class="mb-1 w-full justify-center"
          @click="emit('day', d)"
        />
        <ul class="space-y-1">
          <li
            v-for="item in on(d)"
            :key="item.id"
          >
            <CalendarBlock
              :item="item"
              :when="when(item)"
              :edge="edge[item.state.edge]"
              compact
            />
          </li>
        </ul>
      </li>
    </ol>

    <!-- Day: what spans every column first, then one column for each, or the chosen one on a phone. -->
    <div
      v-else-if="view === 'day'"
      class="space-y-3"
    >
      <ul
        v-if="spanning.length"
        class="space-y-1"
      >
        <li
          v-for="item in spanning"
          :key="item.id"
        >
          <CalendarBlock
            :item="item"
            :when="when(item)"
            :edge="edge[item.state.edge]"
          />
        </li>
      </ul>
      <USelect
        v-if="columns.length > 1"
        v-model="chosen"
        :items="columns.map(c => ({ value: c.id, label: c.label }))"
        aria-label="Column"
        class="sm:hidden"
      />
      <ol
        class="grid gap-3"
        :style="{ '--cols': Math.max(columns.length, 1) }"
        :class="columns.length > 1 ? 'sm:grid-cols-[repeat(var(--cols),minmax(0,1fr))]' : ''"
      >
        <li
          v-for="c in columns"
          :key="c.id"
          class="min-w-0"
          :class="c.id === chosen ? '' : 'hidden sm:block'"
        >
          <h3 class="mb-2 text-sm font-semibold">
            {{ c.label }}
          </h3>
          <p
            v-if="!on(day).some(i => i.column === c.id)"
            class="text-sm text-muted"
          >
            Free
          </p>
          <ul class="space-y-1">
            <li
              v-for="item in on(day).filter(i => i.column === c.id)"
              :key="item.id"
            >
              <CalendarBlock
                :item="item"
                :when="when(item)"
                :edge="edge[item.state.edge]"
              />
            </li>
          </ul>
        </li>
      </ol>
    </div>
  </div>
</template>
