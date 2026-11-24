<!-- The board's Day view (PP-03): spaces across, time down, for one operating day between the plan's
     first and last hour. This plan's placements are drawn in front in colour; everything else that
     takes a space (other shows, closures, room bookings) is grey behind, named only where the reader
     may see it. At phone width it is a list by space and time. -->
<script setup lang="ts">
import type { BoardDay, BoardItem, BoardSpace } from '../../shared/board'

const props = defineProps<{
  day: BoardDay
  spaces: BoardSpace[]
  occupancy: { spaceId: string, items: BoardItem[] }[]
}>()

const { t, te } = useT()
const { time } = useDates()
const HOUR = 3_600_000 // not-policy: an hour in milliseconds
const HOUR_PX = 56 // not-policy: drawing scale
const EDGE = { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted', double: 'border-double border-4' } as const
const OTHER_EDGE: Record<string, keyof typeof EDGE> = { 'performance-scheduled': 'solid', 'performance-draft': 'dashed', 'closure': 'double', 'public-holiday': 'dotted' }

const hours = computed(() => {
  const out: number[] = []
  for (let at = props.day.start; at < props.day.end; at += HOUR) out.push(at)
  return out
})
const height = computed(() => ((props.day.end - props.day.start) / HOUR) * HOUR_PX)
const kindWord = (kind: string) => te(`occupancy.kinds.${kind}`) ? t(`occupancy.kinds.${kind}`) : t('occupancy.kinds.other')

interface Block { id: string, title: string, day: string, startsAt: number, endsAt: number, colour: 1 | 8, state: { label: string, edge: keyof typeof EDGE, usual?: boolean } }
interface Drawn { key: string, block: Block, edge: string, when: string, top: number, height: number, mine: boolean }
function drawn(item: BoardItem): Drawn {
  const from = Math.max(item.from, props.day.start)
  const to = Math.min(item.to, props.day.end)
  const mine = !!item.placement
  const edge: keyof typeof EDGE = mine ? (item.kind === 'performance-scheduled' ? 'solid' : 'dashed') : (OTHER_EDGE[item.kind] ?? 'solid')
  return {
    key: `${item.record.type}:${item.record.id}`,
    block: {
      id: item.record.id,
      title: item.placement?.title ?? item.label ?? t('programme-planning.board.busy'),
      day: item.day,
      startsAt: item.from,
      endsAt: item.to,
      colour: mine ? 1 : 8,
      state: { label: kindWord(item.kind), edge, usual: mine && item.kind === 'performance-draft' },
    },
    edge: EDGE[edge],
    when: `${time(item.from)}–${time(item.to)}`,
    top: ((from - props.day.start) / HOUR) * HOUR_PX,
    height: Math.max(((to - from) / HOUR) * HOUR_PX, HOUR_PX / 3),
    mine,
  }
}
const columns = computed(() => props.spaces.map((space) => {
  const items = props.occupancy.find(o => o.spaceId === space.id)?.items ?? []
  return { space, blocks: items.filter(i => i.to > props.day.start && i.from < props.day.end).map(drawn) }
}))
const placed = computed(() => columns.value.reduce((n, c) => n + c.blocks.filter(b => b.mine).length, 0))
</script>

<template>
  <div class="space-y-3">
    <p
      v-if="!placed"
      class="text-sm text-muted"
    >
      {{ t('programme-planning.board.nothing-placed') }}
    </p>

    <!-- Phone: a list by space and time. -->
    <div class="space-y-4 sm:hidden">
      <p class="text-sm text-muted">
        {{ t('programme-planning.board.phone') }}
      </p>
      <section
        v-for="c in columns"
        :key="c.space.id"
        :aria-label="c.space.name"
      >
        <h3 class="mb-2 text-sm font-semibold text-highlighted">
          {{ c.space.name }}
        </h3>
        <p
          v-if="!c.blocks.length"
          class="text-sm text-muted"
        >
          {{ t('programme-planning.board.free') }}
        </p>
        <ul
          v-else
          class="space-y-2"
        >
          <li
            v-for="b in c.blocks"
            :key="b.key"
          >
            <CalendarBlock
              :item="b.block"
              :when="b.when"
              :edge="b.edge"
            />
          </li>
        </ul>
      </section>
    </div>

    <!-- Wider: spaces across, time down. -->
    <div
      class="hidden overflow-x-auto rounded-md border border-default sm:block"
      role="region"
      tabindex="0"
      :aria-label="t('programme-planning.board.grid-label')"
    >
      <div
        class="grid min-w-max"
        :style="{ gridTemplateColumns: `3.5rem repeat(${Math.max(columns.length, 1)}, minmax(10rem, 1fr))` }"
      >
        <div class="sticky top-0 z-10 border-b border-default bg-default" />
        <div
          v-for="c in columns"
          :key="`head-${c.space.id}`"
          class="sticky top-0 z-10 border-b border-s border-default bg-default px-2 py-2"
        >
          <p class="text-sm font-medium text-highlighted">
            {{ c.space.name }}
          </p>
          <p
            v-if="c.space.venue !== c.space.name"
            class="text-xs text-muted"
          >
            {{ c.space.venue }}
          </p>
        </div>

        <div
          class="relative"
          :style="{ height: `${height}px` }"
          aria-hidden="true"
        >
          <span
            v-for="(at, i) in hours"
            :key="at"
            class="absolute end-2 -translate-y-1/2 text-xs text-muted"
            :style="{ top: `${i * HOUR_PX}px` }"
            :class="i === 0 ? 'translate-y-0' : ''"
          >{{ time(at) }}</span>
        </div>
        <section
          v-for="c in columns"
          :key="`col-${c.space.id}`"
          :aria-label="c.space.name"
          class="relative border-s border-default"
          :style="{ height: `${height}px`, backgroundImage: `repeating-linear-gradient(to bottom, var(--ui-border) 0, var(--ui-border) 1px, transparent 1px, transparent ${HOUR_PX}px)` }"
        >
          <ul>
            <li
              v-for="b in c.blocks"
              :key="b.key"
              class="absolute inset-x-1 overflow-hidden"
              :class="b.mine ? 'z-[2]' : 'z-[1] opacity-80'"
              :style="{ top: `${b.top}px`, height: `${b.height}px` }"
            >
              <CalendarBlock
                :item="b.block"
                :when="b.when"
                :edge="b.edge"
                class="h-full"
              />
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
