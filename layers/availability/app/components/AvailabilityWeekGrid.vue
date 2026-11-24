<!-- The week grid (spec part 5, "How the grid reads"): a column per day, a row per grid step, each
     cell coloured and named by its level. Drag down a day with a mouse, or tap where a stretch starts
     and then where it ends (also Enter on the keyboard); a day's heading paints the whole day.
     Commitments (A5) lie on top, outlined and locked: painting changes what is stated beneath them. -->
<script setup lang="ts">
import { clockOf, DAY_MINUTES, pieceAt, rowStarts, type Commitment, type Day } from '../../shared/grid'
import type { ShownLevel } from '../../shared/levels'

const props = defineProps<{
  days: Day[]
  step: number
  /** The first row in view before scrolling, as "09:00". */
  dayStarts: string
  /** Days before `today` or after `horizon` cannot be painted (A3). */
  today: string
  horizon: string
  /** The label of the pattern covering each date, where one does. */
  patterns?: Record<string, string>
  readonly?: boolean
  /** Headings in place of dates, as for a pattern's typical week; every day can then be painted. */
  headings?: Record<string, string>
  /** What holds the person elsewhere, by date (A5). */
  commitments?: Record<string, Commitment[]>
}>()
const emit = defineEmits<{ paint: [stroke: { date: string, start: number, end: number }] }>()
const { t } = useT()
const dates = useDates()

const ROW_PX = 20 // not-policy: the height of one row, matching h-5
const rows = computed(() => rowStarts(props.step))
const scroller = ref<HTMLElement | null>(null)
onMounted(() => {
  const [h, m] = props.dayStarts.split(':').map(Number)
  if (scroller.value) scroller.value.scrollTop = Math.floor(((h ?? 0) * 60 + (m ?? 0)) / props.step) * ROW_PX - ROW_PX / 2 // not-policy: minutes in an hour; half a row shows its time
})

const LOOK: Record<ShownLevel, string> = {
  free: 'bg-success/25 text-highlighted',
  maybe: 'bg-warning/30 text-highlighted',
  busy: 'bg-error/25 text-highlighted',
  unknown: 'availability-hatch text-muted',
}
const word = (level: ShownLevel) => t(`availability.levels.${level}`)
const open = (date: string) => !props.readonly && (!!props.headings || (date >= props.today && date <= props.horizon))
const named = (date: string) => props.headings?.[date] ?? dates.dayNamed(date)

interface Cell { minute: number, level: ShownLevel, reason?: string, first: boolean, held?: string, heldFirst: boolean, label: string }
const startsIn = (start: number, minute: number) => start >= minute && start < minute + props.step
const columns = computed(() => props.days.map(d => ({
  date: d.date,
  open: open(d.date),
  cells: rows.value.map<Cell>((minute) => {
    const piece = pieceAt(d.pieces, minute)
    const level = piece?.level ?? 'unknown'
    const reason = piece?.reason
    const held = props.commitments?.[d.date]?.find(c => c.start < minute + props.step && minute < c.end)
    const heldLabel = held ? t(held.labelKey) : undefined
    return {
      minute,
      level,
      reason,
      first: !!piece && startsIn(piece.start, minute),
      held: heldLabel,
      heldFirst: !!held && (startsIn(held.start, minute) || (held.start < minute && minute === 0)),
      label: t('availability.grid.cell', { day: named(d.date), from: clockOf(minute), until: clockOf(Math.min(minute + props.step, DAY_MINUTES)), level: word(level) }) + (reason ? `, ${reason}` : '') + (heldLabel ? `, ${t('availability.grid.held', { what: heldLabel })}` : ''),
    }
  }),
})))

// One stroke under way: on one day, from one row to another.
const stroke = ref<{ day: number, from: number, to: number, mode: 'drag' | 'tap' } | null>(null)
const dragged = ref(false)
const focus = ref({ day: 0, row: 0 })
const inStroke = (day: number, row: number) => !!stroke.value && stroke.value.day === day && row >= Math.min(stroke.value.from, stroke.value.to) && row <= Math.max(stroke.value.from, stroke.value.to)

function commit() {
  const s = stroke.value
  stroke.value = null
  if (!s) return
  const [a, b] = [Math.min(s.from, s.to), Math.max(s.from, s.to)]
  emit('paint', { date: props.days[s.day]!.date, start: rows.value[a]!, end: Math.min(rows.value[b]! + props.step, DAY_MINUTES) })
}
function down(event: PointerEvent, day: number, row: number) {
  if (event.pointerType === 'touch' || event.button !== 0 || !columns.value[day]!.open) return
  event.preventDefault()
  dragged.value = true
  stroke.value = { day, from: row, to: row, mode: 'drag' }
  window.addEventListener('pointerup', commit, { once: true })
}
function enter(day: number, row: number) {
  if (stroke.value?.mode === 'drag' && stroke.value.day === day) stroke.value.to = row
}
function tap(day: number, row: number) {
  focus.value = { day, row }
  if (dragged.value) {
    dragged.value = false
    return
  }
  if (!columns.value[day]!.open) return
  if (stroke.value?.mode === 'tap' && stroke.value.day === day) {
    stroke.value.to = row
    commit()
  }
  else {
    stroke.value = { day, from: row, to: row, mode: 'tap' }
  }
}

const cellEls = ref<HTMLElement[]>([])
function move(event: KeyboardEvent) {
  const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
  if (event.key === 'Escape') {
    stroke.value = null
    return
  }
  const by = moves[event.key]
  if (!by) return
  event.preventDefault()
  const day = Math.min(Math.max(focus.value.day + by[0], 0), props.days.length - 1)
  const row = Math.min(Math.max(focus.value.row + by[1], 0), rows.value.length - 1)
  focus.value = { day, row }
  if (stroke.value?.mode === 'tap' && stroke.value.day === day) stroke.value.to = row
  cellEls.value.find(el => el.dataset.at === `${day}:${row}`)?.focus()
}
</script>

<template>
  <div class="space-y-2">
    <p
      class="sr-only"
      aria-live="polite"
    >
      {{ stroke?.mode === 'tap' ? t('availability.grid.now-the-end') : '' }}
    </p>
    <div
      ref="scroller"
      class="max-h-[36rem] overflow-auto rounded-lg border border-default bg-default"
    >
      <div
        class="grid min-w-full select-none"
        :style="{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(5rem, 1fr))` }"
        role="grid"
        :aria-label="t('availability.grid.label')"
        @keydown="move"
      >
        <div
          role="row"
          class="contents"
        >
          <div
            class="sticky top-0 z-10 border-b border-default bg-default"
            role="columnheader"
          >
            <span class="sr-only">{{ t('availability.grid.time') }}</span>
          </div>
          <div
            v-for="(col, d) in columns"
            :key="col.date"
            class="sticky top-0 z-10 border-b border-s border-default bg-default p-1 text-center"
            role="columnheader"
          >
            <UButton
              :label="headings?.[col.date] ?? dates.dayBrief(col.date)"
              :disabled="!col.open"
              color="neutral"
              variant="ghost"
              size="sm"
              block
              :aria-label="t('availability.grid.whole-day', { day: named(col.date) })"
              @click="emit('paint', { date: col.date, start: 0, end: DAY_MINUTES }); focus = { day: d, row: focus.row }"
            />
            <p
              v-if="patterns?.[col.date]"
              class="truncate text-xs text-muted"
            >
              <UIcon
                name="i-lucide-repeat"
                class="me-0.5 size-3 align-[-2px]"
              />{{ patterns[col.date] }}
            </p>
          </div>
        </div>
        <div
          v-for="(minute, r) in rows"
          :key="minute"
          role="row"
          class="contents"
        >
          <div
            class="h-5 pe-2 text-end text-xs text-muted tabular-nums"
            :class="minute % 60 === 0 ? 'border-t border-default' : ''"
            role="rowheader"
          >
            <span
              v-if="minute % 60 === 0"
              class="relative -top-2"
            >{{ clockOf(minute) }}</span>
          </div>
          <button
            v-for="(col, d) in columns"
            :key="`${col.date}:${minute}`"
            ref="cellEls"
            type="button"
            role="gridcell"
            :data-at="`${d}:${r}`"
            :tabindex="focus.day === d && focus.row === r ? 0 : -1"
            :aria-label="col.cells[r]!.label"
            :aria-disabled="!col.open"
            :aria-selected="inStroke(d, r)"
            class="relative h-5 overflow-hidden border-s border-default px-1 text-start text-[0.7rem] leading-5 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary"
            :class="[
              LOOK[col.cells[r]!.level],
              minute % 60 === 0 ? 'border-t' : '',
              col.open ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
              inStroke(d, r) ? 'ring-2 ring-inset ring-primary' : '',
            ]"
            @pointerdown="down($event, d, r)"
            @pointerenter="enter(d, r)"
            @click="tap(d, r)"
          >
            <span
              v-if="col.cells[r]!.held"
              class="pointer-events-none absolute inset-y-0 inset-x-0.5 border-x-2 border-inverted/60 bg-default/60"
              :class="col.cells[r]!.heldFirst ? 'border-t-2' : ''"
              aria-hidden="true"
            >
              <span
                v-if="col.cells[r]!.heldFirst"
                class="flex items-center gap-0.5 px-0.5 font-medium text-highlighted"
              ><UIcon
                name="i-lucide-lock"
                class="size-3 shrink-0"
              /><span class="truncate">{{ col.cells[r]!.held }}</span></span>
            </span>
            <span
              v-if="col.cells[r]!.first && !col.cells[r]!.held"
              class="font-medium"
            >{{ word(col.cells[r]!.level) }}<em
              v-if="col.cells[r]!.reason"
              class="ms-1 font-normal"
            >{{ col.cells[r]!.reason }}</em></span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.availability-hatch {
  background-image: repeating-linear-gradient(135deg, var(--ui-bg-accented) 0 4px, transparent 4px 8px);
}
</style>
