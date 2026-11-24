<!-- The rota grid (FH-48): show nights across, venues and duties down. Pick cells, then apply a rota
     template to them as one batch per venue, or add one shift in each; right-click a shift for more. -->
<script setup lang="ts">
import { parseDate, parseDateTime, parseTime, today, toZoned } from '@internationalized/date'
import type { ContextMenuItem } from '@nuxt/ui'

interface GridShift { id: string, title: string | null, callAt: number, endsAt: number, places: number, placesTaken: number, state: string, batchId: string | null, crewCallId: string | null, urgent: boolean }
interface GridRow { venueId: string | null, venueName: string, dutyId: string, dutyName: string, cells: Record<string, GridShift[]> }
interface PerformanceCount { venueId: string, venueName: string, day: string, shifts: number, performanceIds: string[] }
interface Grid { days: string[], rows: GridRow[], performances: PerformanceCount[], can: { manage: boolean } }
interface Choices {
  venues: { id: string, name: string }[]
  spaces: { id: string, name: string, venueId: string }[]
  duties: { id: string, name: string }[]
  crewCalls: { id: string, name: string }[]
}
interface Batch { id: string, title: string, venueName: string, days: string[], callTime: string, endTime: string, made: number, templateName: string }
interface Kept { shiftId: string, dutyName: string, callAt: number, placesTaken: number }
/** A picked cell: a venue's day, and the duty when it is a duty's row rather than the venue's own. */
interface Cell { venueId: string, dutyId: string | null, day: string }

const { t } = useT()
const { $api } = useNuxtApp()
const write = useAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const dates = useDates()
const route = useRoute()
const router = useRouter()
const ANY = 'any'
const FORTNIGHT = 13 // not-policy: the days shown after the first, when none are chosen

const plusDays = (day: string, n: number) => parseDate(day).add({ days: n }).toString()
const localToday = () => today(dates.zone.value).toString()

const queryText = (key: string) => (route.query[key] as string | undefined) || undefined
const range = computed({
  get: () => {
    const start = queryText('from') ?? localToday()
    return { start, end: queryText('to') ?? plusDays(start, FORTNIGHT) }
  },
  set: (v: { start: string, end: string }) => { void router.replace({ query: { ...route.query, from: v.start || undefined, to: v.end || v.start || undefined } }) },
})
const choose = (key: string) => computed({
  get: () => queryText(key) ?? ANY,
  set: (v: string) => { void router.replace({ query: { ...route.query, [key]: v === ANY ? undefined : v } }) },
})
const crewCall = choose('call')
const venue = choose('venue')
const duty = choose('duty')
const unfilled = computed({
  get: () => route.query.unfilled === '1',
  set: (v: boolean) => { void router.replace({ query: { ...route.query, unfilled: v ? '1' : undefined } }) },
})
const query = computed(() => ({
  from: range.value.start,
  to: range.value.end,
  crewCallId: crewCall.value === ANY ? undefined : crewCall.value,
  venueId: venue.value === ANY ? undefined : venue.value,
  dutyId: duty.value === ANY ? undefined : duty.value,
  unfilled: unfilled.value ? '1' : undefined,
}))
const { data, status, error, refresh } = await useAPI<Grid>('/api/front-of-house/grid', { key: 'front-of-house:grid', query })
const { data: choices } = await useAPI<Choices>('/api/front-of-house/choices', { key: 'front-of-house:choices' })
const { data: templates } = await useAPI<{ templates: { id: string, name: string }[] }>('/api/front-of-house/rota-templates', { key: 'front-of-house:rota-templates', default: () => ({ templates: [] }) })

const anyItem = (label: string) => ({ value: ANY, label })
const callItems = computed(() => [anyItem(t('front-of-house.grid.any-call')), ...(choices.value?.crewCalls ?? []).map(c => ({ value: c.id, label: c.name }))])
const venueItems = computed(() => [anyItem(t('front-of-house.any-venue')), ...(choices.value?.venues ?? []).map(v => ({ value: v.id, label: v.name }))])
const dutyItems = computed(() => [anyItem(t('front-of-house.grid.any-duty')), ...(choices.value?.duties ?? []).map(d => ({ value: d.id, label: d.name }))])
const templateItems = computed(() => (templates.value?.templates ?? []).map(x => ({ value: x.id, label: x.name })))

// Every venue in view gets its own line, so a venue with nothing yet can still be picked.
const venues = computed(() => {
  const shown = (choices.value?.venues ?? []).filter(v => venue.value === ANY || v.id === venue.value)
  return shown.map(v => ({
    ...v,
    rows: (data.value?.rows ?? []).filter(r => r.venueId === v.id),
    performances: Object.fromEntries((data.value?.performances ?? []).filter(p => p.venueId === v.id).map(p => [p.day, p])),
  }))
})

const picked = ref<Cell[]>([])
const same = (a: Cell, b: Cell) => a.venueId === b.venueId && a.dutyId === b.dutyId && a.day === b.day
const isPicked = (c: Cell) => picked.value.some(p => same(p, c))
function togglePick(c: Cell) {
  picked.value = isPicked(c) ? picked.value.filter(p => !same(p, c)) : [...picked.value, c]
}
watch(query, () => { picked.value = [] })
const pickedVenues = computed(() => [...new Set(picked.value.map(p => p.venueId))])
const venueName = (id: string) => choices.value?.venues.find(v => v.id === id)?.name ?? ''

// Moving round the grid with the arrow keys, a cell at a time.
const table = ref<HTMLElement | null>(null)
function move(event: KeyboardEvent) {
  const step = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key]
  const here = (event.target as HTMLElement).closest<HTMLElement>('[data-r]')
  if (!step || !here || !table.value) return
  const next = table.value.querySelector<HTMLElement>(`[data-r="${Number(here.dataset.r) + step[0]!}"][data-c="${Number(here.dataset.c) + step[1]!}"]`)
  if (!next) return
  event.preventDefault()
  next.focus()
}
const rowIndex = (venueAt: number, rowAt: number) => venueAt * 1000 + rowAt // not-policy: room for a venue's duty rows

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const pageRefusal = ref<ReturnType<typeof toRefusal> | null>(null)

// Applying a template: one batch for each venue picked, on the days picked in it.
const applyOpen = ref(false)
const applyForm = ref({ templateId: '', title: '', callTime: '18:00', endTime: '23:00', crewCallId: ANY, spaceId: ANY, signUp: true })
const spaceItems = computed(() => {
  const only = pickedVenues.value.length === 1 ? pickedVenues.value[0] : null
  return [anyItem(t('front-of-house.grid.no-space')), ...(choices.value?.spaces ?? []).filter(s => s.venueId === only).map(s => ({ value: s.id, label: s.name }))]
})
function openApply() {
  refusal.value = null
  applyForm.value = { ...applyForm.value, crewCallId: crewCall.value, spaceId: ANY }
  applyOpen.value = true
}
const timeOf = (value: string) => {
  try { return value ? parseTime(value) : undefined }
  catch { return undefined }
}
const hhmm = (value: unknown) => value ? String(value).slice(0, 5) : '' // not-policy: HH:mm
async function apply() {
  refusal.value = null
  const f = applyForm.value
  try {
    let made = 0
    for (const venueId of pickedVenues.value) {
      const days = [...new Set(picked.value.filter(p => p.venueId === venueId).map(p => p.day))]
      const result = await write<{ batchId: string, shiftIds: string[] }>('/api/front-of-house/batches', {
        method: 'POST',
        body: { templateId: f.templateId, venueId, spaceId: f.spaceId === ANY ? null : f.spaceId, title: f.title.trim(), days, callTime: f.callTime, endTime: f.endTime, crewCallId: f.crewCallId === ANY ? null : f.crewCallId, signUp: f.signUp },
      })
      made += result.shiftIds.length
    }
    toast.add({ title: t('front-of-house.grid.batch-made', { count: made }), color: 'success' })
    applyOpen.value = false
    picked.value = []
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// Adding one shift in each picked duty cell, at the times given.
const addOpen = ref(false)
const addForm = ref({ title: '', places: 2, callTime: '18:00', endTime: '23:00', signUp: true }) // not-policy: a starting count, changed in the form
const dutyCells = computed(() => picked.value.filter(p => p.dutyId))
const instant = (day: string, time: string, nextDay = false) => toZoned(parseDateTime(`${nextDay ? plusDays(day, 1) : day}T${time}`), dates.zone.value).toDate().getTime()
function openAdd() {
  refusal.value = null
  addOpen.value = true
}
async function add() {
  refusal.value = null
  const f = addForm.value
  try {
    for (const c of dutyCells.value) {
      await write('/api/front-of-house/shifts', {
        method: 'POST',
        body: { title: f.title.trim(), venueId: c.venueId, dutyId: c.dutyId, places: f.places, callAt: instant(c.day, f.callTime), endsAt: instant(c.day, f.endTime, f.endTime <= f.callTime), signUp: f.signUp, crewCallId: crewCall.value === ANY ? null : crewCall.value },
      })
    }
    toast.add({ title: t('front-of-house.grid.shifts-added', { count: dutyCells.value.length }), color: 'success' })
    addOpen.value = false
    picked.value = []
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// A shift's own menu: open it, copy it to other days in view, or cancel it.
const shiftPage = (s: GridShift) => `/members/front-of-house/shifts/${encodeURIComponent(s.id)}`
const copying = ref<{ shift: GridShift, day: string } | null>(null)
const copyDays = ref<string[]>([])
const cancelling = ref<GridShift | null>(null)
const cancelReason = ref('')
const menuItems = shallowRef<ContextMenuItem[][]>([])
function menuFor(s: GridShift, day: string) {
  const manage = data.value?.can.manage
  menuItems.value = [
    [{ label: t('front-of-house.grid.open-shift'), icon: 'i-lucide-arrow-right', to: shiftPage(s) }],
    ...(manage && s.state !== 'completed'
      ? [[
          { label: t('front-of-house.grid.copy'), icon: 'i-lucide-copy', onSelect: () => startCopy(s, day) },
          { label: t('front-of-house.grid.cancel-shift'), icon: 'i-lucide-ban', color: 'error' as const, onSelect: () => startCancel(s) },
        ]]
      : []),
  ]
}
function startCopy(s: GridShift, day: string) {
  refusal.value = null
  copyDays.value = []
  copying.value = { shift: s, day }
}
function startCancel(s: GridShift) {
  refusal.value = null
  cancelReason.value = ''
  cancelling.value = s
}
async function copy() {
  if (!copying.value) return
  refusal.value = null
  try {
    const done = await write<{ shiftIds: string[] }>(`/api/front-of-house/shifts/${encodeURIComponent(copying.value.shift.id)}/copy`, { method: 'POST', body: { days: copyDays.value } })
    toast.add({ title: t('front-of-house.grid.copied', { count: done.shiftIds.length }), color: 'success' })
    copying.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function cancelShift() {
  if (!cancelling.value) return
  refusal.value = null
  try {
    await write(`/api/front-of-house/shifts/${encodeURIComponent(cancelling.value.id)}/cancel`, { method: 'POST', body: { reason: cancelReason.value.trim() } })
    toast.add({ title: t('front-of-house.grid.cancelled'), color: 'success' })
    cancelling.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// Batches still standing, so one made by mistake can be taken away again.
const batchesOpen = ref(false)
const batches = ref<Batch[]>([])
const kept = ref<Kept[] | null>(null)
async function showBatches() {
  pageRefusal.value = null
  kept.value = null
  try {
    const path: string = '/api/front-of-house/batches'
    batches.value = (await $api<{ batches: Batch[] }>(path, { query: { crewCallId: query.value.crewCallId } })).batches
    batchesOpen.value = true
  }
  catch (e) {
    pageRefusal.value = toRefusal(e)
  }
}
async function removeBatch(b: Batch) {
  refusal.value = null
  try {
    const done = await write<{ cancelled: number, kept: Kept[] }>(`/api/front-of-house/batches/${encodeURIComponent(b.id)}/remove`, { method: 'POST', body: {} })
    toast.add({ title: t('front-of-house.grid.batch-removed', { count: done.cancelled }), color: 'success' })
    batches.value = batches.value.filter(x => x.id !== b.id)
    kept.value = done.kept.length ? done.kept : null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const shiftLabel = (s: GridShift) => t('front-of-house.grid.shift-label', { time: dates.time(s.callAt), taken: s.placesTaken, places: s.places })
const applyRef = useFormRef('applyRef')
const addRef = useFormRef('addRef')
const copyRef = useFormRef('copyRef')
const cancelRef = useFormRef('cancelRef')
const otherDays = computed(() => (data.value?.days ?? []).filter(d => d !== copying.value?.day).map(d => ({ value: d, label: dates.dayBrief(d) })))
</script>

<template>
  <PageFrame
    :title="t('front-of-house.navigation.grid.label')"
    :description="t('front-of-house.grid.description')"
  >
    <template #primary>
      <UButton
        v-if="data?.can.manage"
        color="neutral"
        variant="outline"
        icon="i-lucide-layers"
        :label="t('front-of-house.grid.batches')"
        loading-auto
        @click="showBatches"
      />
    </template>
    <div class="space-y-6">
      <div class="flex flex-wrap items-end gap-4">
        <UFormField :label="t('front-of-house.grid.days')">
          <FieldDateRange v-model="range" />
        </UFormField>
        <UFormField :label="t('front-of-house.grid.crew-call')">
          <USelectMenu
            v-model="crewCall"
            :items="callItems"
            value-key="value"
          />
        </UFormField>
        <UFormField :label="t('front-of-house.venue')">
          <USelectMenu
            v-model="venue"
            :items="venueItems"
            value-key="value"
          />
        </UFormField>
        <UFormField :label="t('front-of-house.grid.duty')">
          <USelectMenu
            v-model="duty"
            :items="dutyItems"
            value-key="value"
          />
        </UFormField>
        <UCheckbox
          v-model="unfilled"
          :label="t('front-of-house.rota.unfilled')"
        />
      </div>
      <RefusalNotice :refusal="pageRefusal" />
      <PageSection
        v-if="picked.length && data?.can.manage"
        :title="t('front-of-house.grid.picked', { count: picked.length })"
      >
        <div class="flex flex-wrap items-center gap-3">
          <UButton
            icon="i-lucide-layout-list"
            :label="t('front-of-house.grid.apply')"
            @click="openApply"
          />
          <UButton
            v-if="dutyCells.length"
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            :label="t('front-of-house.grid.add', { count: dutyCells.length })"
            @click="openAdd"
          />
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('front-of-house.grid.clear')"
            @click="picked = []"
          />
        </div>
      </PageSection>
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <template #default="{ data: d }">
          <EmptyState
            v-if="!venues.length"
            icon="i-lucide-grid-3x3"
            :title="t('front-of-house.grid.empty.title')"
            :description="t('front-of-house.grid.empty.description')"
          />
          <UContextMenu
            v-else
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
                      v-for="day in d.days"
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
                      v-for="(day, di) in d.days"
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
                        <button
                          type="button"
                          class="min-h-7 w-full rounded-md text-left text-xs hover:bg-accented focus-visible:outline-2 focus-visible:outline-primary"
                          :class="{ 'bg-primary/10 ring-1 ring-primary': isPicked({ venueId: v.id, dutyId: null, day }) }"
                          :data-r="rowIndex(vi, 0)"
                          :data-c="di"
                          :aria-pressed="isPicked({ venueId: v.id, dutyId: null, day })"
                          :aria-label="t('front-of-house.grid.pick-venue-day', { venue: v.name, day: dates.dayNamed(day) })"
                          :disabled="!d.can.manage"
                          @click="togglePick({ venueId: v.id, dutyId: null, day })"
                        >
                          <span class="sr-only">{{ t('front-of-house.grid.pick') }}</span>
                        </button>
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
                      v-for="(day, di) in d.days"
                      :key="day"
                      class="p-1 align-top"
                      :class="{ 'bg-primary/10': isPicked({ venueId: v.id, dutyId: r.dutyId, day }) }"
                    >
                      <div class="flex flex-col gap-1">
                        <ULink
                          v-for="s in r.cells[day] ?? []"
                          :key="s.id"
                          :to="shiftPage(s)"
                          class="rounded-md border px-2 py-1 text-xs hover:bg-accented"
                          :class="s.urgent ? 'border-warning text-warning' : s.placesTaken >= s.places ? 'border-success' : 'border-default'"
                          :aria-label="`${r.dutyName}, ${dates.dayNamed(day)}: ${shiftLabel(s)}${s.state === 'draft' ? `, ${t('front-of-house.grid.draft')}` : ''}`"
                          @contextmenu="menuFor(s, day)"
                        >
                          {{ shiftLabel(s) }}
                          <span
                            v-if="s.state === 'draft'"
                            class="text-muted"
                          >· {{ t('front-of-house.grid.draft') }}</span>
                        </ULink>
                        <button
                          type="button"
                          class="min-h-7 w-full rounded-md text-left text-xs text-dimmed hover:bg-accented focus-visible:outline-2 focus-visible:outline-primary"
                          :data-r="rowIndex(vi, ri + 1)"
                          :data-c="di"
                          :aria-pressed="isPicked({ venueId: v.id, dutyId: r.dutyId, day })"
                          :aria-label="t('front-of-house.grid.pick-cell', { duty: r.dutyName, venue: v.name, day: dates.dayNamed(day) })"
                          :disabled="!d.can.manage"
                          @click="togglePick({ venueId: v.id, dutyId: r.dutyId, day })"
                        >
                          <span class="sr-only">{{ t('front-of-house.grid.pick') }}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UContextMenu>
        </template>
      </DataBoundary>
    </div>

    <UModal
      v-model:open="applyOpen"
      :title="t('front-of-house.grid.apply-title')"
      :description="t('front-of-house.grid.apply-description', { count: picked.length, venues: pickedVenues.map(venueName).join(', ') })"
    >
      <template #body>
        <UForm
          id="fh-grid-apply"
          ref="applyRef"
          class="space-y-4"
          :state="applyForm"
          :validate="() => needs({ templateId: applyForm.templateId, title: applyForm.title, callTime: applyForm.callTime, endTime: applyForm.endTime })"
          novalidate
          @submit="apply"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="templateId"
            :label="t('front-of-house.rota.template')"
            required
          >
            <USelectMenu
              v-model="applyForm.templateId"
              :items="templateItems"
              value-key="value"
              :placeholder="t('front-of-house.rota.choose-template')"
            />
          </UFormField>
          <UFormField
            name="title"
            :label="t('front-of-house.grid.title')"
            :help="t('front-of-house.grid.title-help')"
            required
          >
            <UInput
              v-model="applyForm.title"
              maxlength="80"
            />
          </UFormField>
          <div class="flex flex-wrap gap-4">
            <UFormField
              name="callTime"
              :label="t('front-of-house.grid.call-time')"
              required
            >
              <UInputTime
                :model-value="timeOf(applyForm.callTime)"
                :hour-cycle="24"
                @update:model-value="v => applyForm.callTime = hhmm(v)"
              />
            </UFormField>
            <UFormField
              name="endTime"
              :label="t('front-of-house.grid.end-time')"
              :help="t('front-of-house.grid.end-help')"
              required
            >
              <UInputTime
                :model-value="timeOf(applyForm.endTime)"
                :hour-cycle="24"
                @update:model-value="v => applyForm.endTime = hhmm(v)"
              />
            </UFormField>
          </div>
          <UFormField
            v-if="pickedVenues.length === 1"
            :label="t('front-of-house.grid.space')"
          >
            <USelectMenu
              v-model="applyForm.spaceId"
              :items="spaceItems"
              value-key="value"
            />
          </UFormField>
          <UFormField :label="t('front-of-house.grid.crew-call')">
            <USelectMenu
              v-model="applyForm.crewCallId"
              :items="[anyItem(t('front-of-house.grid.no-call')), ...callItems.slice(1)]"
              value-key="value"
            />
          </UFormField>
          <UCheckbox
            v-model="applyForm.signUp"
            :label="t('front-of-house.grid.sign-up')"
          />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="fh-grid-apply"
          :loading="applyRef?.loading"
          :label="t('front-of-house.grid.apply')"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="addOpen"
      :title="t('front-of-house.grid.add-title', { count: dutyCells.length })"
    >
      <template #body>
        <UForm
          id="fh-grid-add"
          ref="addRef"
          class="space-y-4"
          :state="addForm"
          :validate="() => needs({ title: addForm.title, places: addForm.places, callTime: addForm.callTime, endTime: addForm.endTime })"
          novalidate
          @submit="add"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="title"
            :label="t('front-of-house.grid.title')"
            required
          >
            <UInput
              v-model="addForm.title"
              maxlength="80"
            />
          </UFormField>
          <UFormField
            name="places"
            :label="t('front-of-house.grid.places')"
            required
          >
            <FieldNumber
              v-model="addForm.places"
              :min="1"
              :max="50"
            />
          </UFormField>
          <div class="flex flex-wrap gap-4">
            <UFormField
              name="callTime"
              :label="t('front-of-house.grid.call-time')"
              required
            >
              <UInputTime
                :model-value="timeOf(addForm.callTime)"
                :hour-cycle="24"
                @update:model-value="v => addForm.callTime = hhmm(v)"
              />
            </UFormField>
            <UFormField
              name="endTime"
              :label="t('front-of-house.grid.end-time')"
              :help="t('front-of-house.grid.end-help')"
              required
            >
              <UInputTime
                :model-value="timeOf(addForm.endTime)"
                :hour-cycle="24"
                @update:model-value="v => addForm.endTime = hhmm(v)"
              />
            </UFormField>
          </div>
          <UCheckbox
            v-model="addForm.signUp"
            :label="t('front-of-house.grid.sign-up')"
          />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="fh-grid-add"
          :loading="addRef?.loading"
          :label="t('front-of-house.grid.add', { count: dutyCells.length })"
        />
      </template>
    </UModal>

    <UModal
      :open="!!copying"
      :title="t('front-of-house.grid.copy-title')"
      @update:open="v => { if (!v) copying = null }"
    >
      <template #body>
        <UForm
          id="fh-grid-copy"
          ref="copyRef"
          class="space-y-4"
          :state="{ days: copyDays }"
          :validate="() => needs({ days: copyDays })"
          novalidate
          @submit="copy"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="days"
            :label="t('front-of-house.grid.copy-days')"
            :help="t('front-of-house.grid.copy-help')"
            required
          >
            <UCheckboxGroup
              v-model="copyDays"
              :items="otherDays"
              value-key="value"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="fh-grid-copy"
          :loading="copyRef?.loading"
          :label="t('front-of-house.grid.copy')"
        />
      </template>
    </UModal>

    <UModal
      :open="!!cancelling"
      :title="t('front-of-house.grid.cancel-title')"
      @update:open="v => { if (!v) cancelling = null }"
    >
      <template #body>
        <UForm
          id="fh-grid-cancel"
          ref="cancelRef"
          class="space-y-4"
          :state="{ reason: cancelReason }"
          :validate="() => needs({ reason: cancelReason })"
          novalidate
          @submit="cancelShift"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="reason"
            :label="t('front-of-house.grid.cancel-reason')"
            :help="t('front-of-house.grid.cancel-help')"
            required
          >
            <UInput
              v-model="cancelReason"
              maxlength="200"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="fh-grid-cancel"
          color="error"
          :loading="cancelRef?.loading"
          :label="t('front-of-house.grid.cancel-shift')"
        />
      </template>
    </UModal>

    <USlideover
      v-model:open="batchesOpen"
      :title="t('front-of-house.grid.batches')"
      :description="t('front-of-house.grid.batches-description')"
    >
      <template #body>
        <div class="space-y-4">
          <RefusalNotice :refusal="refusal" />
          <UAlert
            v-if="kept"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="t('front-of-house.grid.kept-title', { count: kept.length })"
            :description="kept.map(k => `${k.dutyName}, ${dates.dateTime(k.callAt)}`).join('; ')"
          />
          <RecordList
            v-if="batches.length"
            :label="t('front-of-house.grid.batches')"
          >
            <RecordListItem
              v-for="b in batches"
              :key="b.id"
              icon="i-lucide-layers"
              :name="b.title"
              :description="[b.venueName, b.templateName, dates.range(b.days[0]!, b.days[b.days.length - 1]!), `${b.callTime} to ${b.endTime}`, t('front-of-house.crew-calls.shifts-count', { count: b.made })].join(' · ')"
            >
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-trash-2"
                :label="t('front-of-house.grid.remove-batch')"
                :aria-label="t('front-of-house.grid.remove-batch-named', { name: b.title })"
                loading-auto
                @click="removeBatch(b)"
              />
            </RecordListItem>
          </RecordList>
          <EmptyState
            v-else
            icon="i-lucide-layers"
            :title="t('front-of-house.grid.no-batches.title')"
            :description="t('front-of-house.grid.no-batches.description')"
          />
        </div>
      </template>
    </USlideover>
  </PageFrame>
</template>
