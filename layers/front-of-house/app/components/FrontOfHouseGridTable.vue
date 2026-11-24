<!-- The rota grid itself (FH-48): nights across, venues and their duties down. A cell is picked with
     a press; arrow keys move between cells; a shift opens on a click and offers more on a right-click. -->
<script setup lang="ts">
import type { ContextMenuItem } from '@nuxt/ui'
import { shiftPage, type GridCell, type GridShift, type GridVenue } from '../utils/rota-grid'

const props = defineProps<{
  days: string[]
  venues: GridVenue[]
  manage: boolean
  isPicked: (cell: GridCell) => boolean
  /** The right-click menu for a shift, built by the page. */
  menuFor: (shift: GridShift, day: string) => ContextMenuItem[][]
}>()
const emit = defineEmits<{ pick: [cell: GridCell] }>()
const { t } = useT()
const dates = useDates()

const table = ref<HTMLElement | null>(null)
const menuItems = shallowRef<ContextMenuItem[][]>([])
const ROWS_PER_VENUE = 1000 // not-policy: room for a venue's duty rows in a cell's coordinates
const rowOf = (venueAt: number, rowAt: number) => venueAt * ROWS_PER_VENUE + rowAt

function move(event: KeyboardEvent) {
  const step = ({ ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] } as Record<string, [number, number]>)[event.key]
  const here = (event.target as HTMLElement).closest<HTMLElement>('[data-r]')
  if (!step || !here || !table.value) return
  const rows = [...new Set([...table.value.querySelectorAll<HTMLElement>('[data-r]')].map(e => Number(e.dataset.r)))].sort((a, b) => a - b)
  const r = rows[rows.indexOf(Number(here.dataset.r)) + step[0]]
  const next = r === undefined ? null : table.value.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${Number(here.dataset.c) + step[1]}"]`)
  if (!next) return
  event.preventDefault()
  next.focus()
}
const label = (s: GridShift) => t('front-of-house.grid.shift-label', { time: dates.time(s.callAt), taken: s.placesTaken, places: s.places })
const tone = (s: GridShift) => s.urgent ? 'border-warning text-warning' : s.placesTaken >= s.places ? 'border-success' : 'border-default'
function openMenu(s: GridShift, day: string) {
  menuItems.value = props.menuFor(s, day)
}
</script>

<template>
  <UContextMenu
    :modal="false"
    :items="menuItems"
  >
    <div
      ref="table"
      class="overflow-x-auto rounded-md border border-default"
      @keydown="move"
    >
      <table
        class="w-full border-collapse text-sm"
        :aria-label="t('front-of-house.navigation.grid.label')"
      >
        <thead>
          <tr>
            <th
              scope="col"
              class="sticky left-0 z-10 min-w-44 bg-default px-3 py-2 text-left font-medium text-muted"
            >
              {{ t('front-of-house.grid.venue-duty') }}
            </th>
            <th
              v-for="day in days"
              :key="day"
              scope="col"
              class="min-w-28 px-2 py-2 text-left font-medium text-muted"
            >
              {{ dates.dayBrief(day) }}
            </th>
          </tr>
        </thead>
        <tbody
          v-for="(v, vi) in venues"
          :key="v.id"
        >
          <tr class="border-t border-default bg-elevated/50">
            <th
              scope="row"
              class="sticky left-0 z-10 bg-elevated px-3 py-2 text-left font-semibold text-highlighted"
            >
              {{ v.name }}
            </th>
            <td
              v-for="(day, di) in days"
              :key="day"
              class="p-1 align-top"
            >
              <div class="flex flex-col gap-1">
                <ULink
                  v-if="v.performances[day]"
                  :to="{ path: '/console/front-of-house/rota', query: { venue: v.id } }"
                  class="px-2 text-xs text-muted hover:underline"
                >
                  {{ t('front-of-house.grid.performance-shifts', { count: v.performances[day]!.shifts }) }}
                </ULink>
                <FrontOfHouseGridPick
                  :cell="{ venueId: v.id, dutyId: null, day }"
                  :row="rowOf(vi, 0)"
                  :column="di"
                  :picked="isPicked({ venueId: v.id, dutyId: null, day })"
                  :disabled="!manage"
                  :label="t('front-of-house.grid.pick-venue-day', { venue: v.name, day: dates.dayNamed(day) })"
                  @pick="emit('pick', $event)"
                />
              </div>
            </td>
          </tr>
          <tr
            v-for="(r, ri) in v.rows"
            :key="r.dutyId"
            class="border-t border-default"
          >
            <th
              scope="row"
              class="sticky left-0 z-10 bg-default px-3 py-2 pl-6 text-left font-normal"
            >
              {{ r.dutyName }}
            </th>
            <td
              v-for="(day, di) in days"
              :key="day"
              class="p-1 align-top"
            >
              <div class="flex flex-col gap-1">
                <ULink
                  v-for="s in r.cells[day] ?? []"
                  :key="s.id"
                  :to="shiftPage(s.id)"
                  class="rounded-md border px-2 py-1 text-xs hover:bg-accented"
                  :class="tone(s)"
                  :aria-label="`${r.dutyName}, ${dates.dayNamed(day)}: ${label(s)}${s.state === 'draft' ? `, ${t('front-of-house.grid.draft')}` : ''}`"
                  @contextmenu="openMenu(s, day)"
                >
                  {{ label(s) }}
                  <span
                    v-if="s.state === 'draft'"
                    class="text-muted"
                  >· {{ t('front-of-house.grid.draft') }}</span>
                </ULink>
                <FrontOfHouseGridPick
                  :cell="{ venueId: v.id, dutyId: r.dutyId, day }"
                  :row="rowOf(vi, ri + 1)"
                  :column="di"
                  :picked="isPicked({ venueId: v.id, dutyId: r.dutyId, day })"
                  :disabled="!manage"
                  :label="t('front-of-house.grid.pick-cell', { duty: r.dutyName, venue: v.name, day: dates.dayNamed(day) })"
                  @pick="emit('pick', $event)"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </UContextMenu>
</template>
