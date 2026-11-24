<!-- The occupancy grid (OC-02): spaces down the side, operating days across, and in each cell what
     takes that space that day, drawn as the shared calendar draws a block (UI-35): one of the eight
     colours, an edge and a word for the kind, so nothing rests on colour alone. Read-only. The
     programme board adds drag and the tray through the cell and block slots; the room calendar may
     reuse it. At phone width it is a list, space by space and day by day. -->
<script setup lang="ts">
import type { OccupancyItem, SpaceOccupancy } from '../../shared/occupancy'

type Edge = 'solid' | 'dashed' | 'dotted' | 'double'
/** The shape CalendarBlock draws (core's CalendarItem). */
interface Block {
  id: string
  title: string
  day: string
  lastDay?: string
  startsAt?: number
  endsAt?: number
  colour: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  state: { label: string, edge: Edge, usual?: boolean }
}

export interface OccupancyLook {
  colour: Block['colour']
  edge: Edge
  /** The kind in words. */
  word: string
}

const props = defineProps<{
  spaces: { id: string, label: string }[]
  /** The operating days drawn, in order, YYYY-MM-DD. */
  days: string[]
  occupancy: SpaceOccupancy[]
  /** How an item looks; left out, core's kinds have their own and anything else is grey. */
  look?: (item: OccupancyItem) => OccupancyLook | undefined
}>()

defineSlots<{
  /** One space on one day; the default draws its blocks. */
  cell?: (props: { space: { id: string, label: string }, day: string, items: OccupancyItem[] }) => unknown
  /** One block; the default is the calendar's. */
  block?: (props: { item: OccupancyItem, block: Block }) => unknown
}>()

const { t, te } = useT()
const dates = useDates()

const CORE_LOOK: Record<string, Omit<OccupancyLook, 'word'>> = {
  'performance-scheduled': { colour: 1, edge: 'solid' },
  'performance-draft': { colour: 1, edge: 'dashed' },
  'closure': { colour: 5, edge: 'double' },
  'public-holiday': { colour: 8, edge: 'dotted' },
}
const lookOf = (item: OccupancyItem): OccupancyLook => props.look?.(item)
  ?? { ...(CORE_LOOK[item.kind] ?? { colour: 8, edge: 'solid' }), word: te(`occupancy.kinds.${item.kind}`) ? t(`occupancy.kinds.${item.kind}`) : t('occupancy.kinds.other') }

const edge = { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted', double: 'border-double border-4' } as const
const blockOf = (item: OccupancyItem): Block => {
  const look = lookOf(item)
  return {
    id: `${item.record.type}:${item.record.id}`,
    title: item.label ?? t('occupancy.grid.busy'),
    day: item.day,
    lastDay: item.lastDay,
    startsAt: item.from,
    endsAt: item.to,
    colour: look.colour,
    state: { label: look.word, edge: look.edge },
  }
}
const when = (item: OccupancyItem) => `${dates.time(item.from)}–${dates.time(item.to)}`

const bySpace = computed(() => new Map(props.occupancy.map(s => [s.spaceId, s.items])))
const itemsOn = (spaceId: string, day: string) => (bySpace.value.get(spaceId) ?? []).filter(i => i.day <= day && day <= i.lastDay)
const anything = computed(() => props.spaces.some(s => props.days.some(d => itemsOn(s.id, d).length)))
</script>

<template>
  <div>
    <!-- Phone: a list, space by space and day by day. -->
    <div class="space-y-4 sm:hidden">
      <p
        v-if="!anything"
        class="text-muted"
      >
        {{ t('occupancy.grid.nothing') }}
      </p>
      <template
        v-for="space in spaces"
        :key="space.id"
      >
        <section
          v-if="days.some(d => itemsOn(space.id, d).length)"
          :aria-label="space.label"
        >
          <h3 class="mb-2 text-sm font-semibold text-highlighted">
            {{ space.label }}
          </h3>
          <template
            v-for="day in days"
            :key="day"
          >
            <div
              v-if="itemsOn(space.id, day).length"
              class="mb-3"
            >
              <p class="mb-1 text-xs text-muted">
                {{ dates.dayNamed(day) }}
              </p>
              <ul class="space-y-1">
                <li
                  v-for="item in itemsOn(space.id, day)"
                  :key="`${item.record.type}:${item.record.id}`"
                >
                  <slot
                    name="block"
                    :item="item"
                    :block="blockOf(item)"
                  >
                    <CalendarBlock
                      :item="blockOf(item)"
                      :when="when(item)"
                      :edge="edge[lookOf(item).edge]"
                    />
                  </slot>
                </li>
              </ul>
            </div>
          </template>
        </section>
      </template>
    </div>

    <!-- Wider: a grid of spaces against days, scrolling sideways inside itself when it is wide. -->
    <div class="hidden overflow-x-auto sm:block">
      <table class="w-full table-fixed border-collapse text-sm">
        <caption class="sr-only">
          {{ t('occupancy.module.name') }}
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              class="w-40 border-b border-default px-2 py-1 text-start text-xs font-medium text-muted"
            >
              {{ t('occupancy.grid.space') }}
            </th>
            <th
              v-for="day in days"
              :key="day"
              scope="col"
              class="min-w-32 border-b border-default px-2 py-1 text-start text-xs font-medium text-muted"
            >
              {{ dates.dayAxis(day) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="space in spaces"
            :key="space.id"
          >
            <th
              scope="row"
              class="border-b border-default px-2 py-2 text-start align-top font-medium text-highlighted"
            >
              {{ space.label }}
            </th>
            <td
              v-for="day in days"
              :key="day"
              class="border-b border-s border-default p-1 align-top"
            >
              <slot
                name="cell"
                :space="space"
                :day="day"
                :items="itemsOn(space.id, day)"
              >
                <ul class="space-y-1">
                  <li
                    v-for="item in itemsOn(space.id, day)"
                    :key="`${item.record.type}:${item.record.id}`"
                  >
                    <slot
                      name="block"
                      :item="item"
                      :block="blockOf(item)"
                    >
                      <CalendarBlock
                        :item="blockOf(item)"
                        :when="when(item)"
                        :edge="edge[lookOf(item).edge]"
                        compact
                      />
                    </slot>
                  </li>
                </ul>
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
