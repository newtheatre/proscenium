<!-- Find a time's grid (S7, "How the grid reads"): a column per day, a row per step within the chosen
     hours, each cell "7 of 9 free" and deeper green the more are free. A cell a must-have person cannot
     do is grey and struck through; one where a chosen room is taken is hatched. Choosing a cell lists who is where. -->
<script setup lang="ts">
import { clockOf } from '../../shared/grid'

const props = defineProps<{
  dates: string[]
  step: number
  hours: { start: number, end: number }
  total: number
  counts: (date: string, start: number, end: number) => { free: number, maybe: number, busy: number, unknown: number }
  mustFails: (date: string, start: number, end: number) => boolean
  taken: (date: string, start: number, end: number) => unknown[]
  chosen: { date: string, start: number } | null
}>()
const emit = defineEmits<{ choose: [cell: { date: string, start: number, end: number }] }>()
const { t } = useT()
const format = useDates()

const rows = computed(() => {
  const out: number[] = []
  for (let m = props.hours.start; m < props.hours.end; m += props.step) out.push(m)
  return out
})
const matrix = computed(() => rows.value.map(m => ({
  minute: m,
  cells: props.dates.map((d) => {
    const end = m + props.step
    const free = props.counts(d, m, end).free
    const taken = props.taken(d, m, end).length > 0
    const fails = props.mustFails(d, m, end)
    const label = t('availability.find.cell', { day: format.dayNamed(d), from: clockOf(m), free, total: props.total })
      + (taken ? `, ${t('availability.find.room-taken')}` : '') + (fails ? `, ${t('availability.find.must-cannot')}` : '')
    return { date: d, free, taken, fails, label }
  }),
})))
const SHADES = ['bg-elevated', 'bg-success/10', 'bg-success/20', 'bg-success/30', 'bg-success/45'] // not-policy: five shades of the share free
const shade = (free: number) => props.total ? SHADES[Math.min(SHADES.length - 1, Math.ceil((free / props.total) * (SHADES.length - 1)))] : SHADES[0]
</script>

<template>
  <div class="max-h-[34rem] overflow-auto rounded-md border border-default">
    <table class="w-full border-collapse text-xs">
      <caption class="sr-only">
        {{ t('availability.find.grid-caption') }}
      </caption>
      <thead class="sticky top-0 z-10 bg-default">
        <tr>
          <th
            scope="col"
            class="w-14 border-b border-default p-1"
          >
            <span class="sr-only">{{ t('availability.find.time') }}</span>
          </th>
          <th
            v-for="d in dates"
            :key="d"
            scope="col"
            class="border-b border-s border-default p-1 text-start font-semibold text-highlighted"
          >
            {{ format.dayNamed(d) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in matrix"
          :key="row.minute"
        >
          <th
            scope="row"
            class="border-default p-1 text-end align-top font-normal text-muted tabular-nums"
          >
            {{ row.minute % 60 === 0 ? clockOf(row.minute) : '' }}
          </th>
          <td
            v-for="c in row.cells"
            :key="c.date"
            class="h-6 border-s border-default p-0"
          >
            <button
              type="button"
              class="flex size-full items-center justify-center px-1 tabular-nums text-highlighted outline-primary focus-visible:outline-2"
              :class="[c.fails ? 'bg-elevated line-through' : shade(c.free), c.taken && 'availability-taken', chosen?.date === c.date && chosen.start === row.minute && 'ring-2 ring-inset ring-primary']"
              :aria-label="c.label"
              @click="emit('choose', { date: c.date, start: row.minute, end: row.minute + step })"
            >
              {{ c.free }}/{{ total }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.availability-taken {
  background-image: repeating-linear-gradient(135deg, var(--ui-bg-accented) 0 3px, transparent 3px 7px);
}
</style>
