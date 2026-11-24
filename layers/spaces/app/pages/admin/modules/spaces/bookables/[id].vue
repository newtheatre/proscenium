<!-- A bookable (spec part 5, "Rooms and resources"): its details, its week of opening hours and
     what each purpose may do here (SP-06, SP-09, SP-11, SP-12). Pausing stops new requests and
     keeps what is booked; archiving waits until nothing is booked ahead. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { parseTime } from '@internationalized/date'
import { COLOURS } from '../../../../../../shared/setup'

interface Bookable {
  id: string
  kind: 'space' | 'resource'
  name: string
  venueId: string | null
  control: 'own' | 'external'
  approval: 'by-purpose' | 'always'
  approvalNote: string | null
  externalContact: string | null
  alwaysOpen: boolean
  maxLengthMinutes: number | null
  guidance: string | null
  colour: typeof COLOURS[number] | null
  requirements: string[]
  state: 'active' | 'paused' | 'archived'
  capacity: number | null
}
interface Hours { weekday: number, opensAt: string, closesAt: string }
interface PurposeHere { purposeId: string, name: string, tier: number, approval: 'automatic' | 'approval', allowed: boolean, here: 'automatic' | 'approval' | null }

const { t } = useT()
const route = useRoute()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const undo = useUndo()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<{ bookable: Bookable, hours: Hours[], purposes: PurposeHere[], venues: { id: string, name: string }[], maxLengthMinutes: number, weekStarts: 'monday' | 'sunday' }>(() => `/api/spaces/bookables/${id.value}`, { key: `spaces:bookable:${id.value}` })
const trail = computed(() => [{ label: t('spaces.navigation.bookables.label'), to: '/admin/modules/spaces/bookables' }])
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const STATE_TONE = { active: 'success', paused: 'warning', archived: 'neutral' } as const
const tabs = computed(() => [
  { id: 'details', label: t('spaces.bookable.tabs.details') },
  { id: 'hours', label: t('spaces.bookable.tabs.hours') },
  { id: 'purposes', label: t('spaces.bookable.tabs.purposes') },
  { id: 'people', label: t('spaces.bookable.tabs.people') },
])

// ---- Details

const details = ref({ name: '', homeVenueId: null as string | null, control: 'own' as 'own' | 'external', approval: 'by-purpose' as 'by-purpose' | 'always', approvalNote: '', externalContact: '', guidance: '', colour: null as Bookable['colour'], maxLengthMinutes: null as number | null })
watch(() => data.value?.bookable, (b) => {
  if (!b) return
  details.value = { name: b.name, homeVenueId: b.venueId, control: b.control, approval: b.approval, approvalNote: b.approvalNote ?? '', externalContact: b.externalContact ?? '', guidance: b.guidance ?? '', colour: b.colour, maxLengthMinutes: b.maxLengthMinutes }
}, { immediate: true })
const external = computed(() => details.value.control === 'external')
const controlItems = computed(() => [{ value: 'own', label: t('spaces.bookables.control.own') }, { value: 'external', label: t('spaces.bookables.control.external') }])
const approvalItems = computed(() => [{ value: 'by-purpose', label: t('spaces.bookable.approval.by-purpose') }, { value: 'always', label: t('spaces.bookable.approval.always') }])
// A select cannot hold null, so having none is an item of its own.
const NONE = 'none'
const colourItems = computed(() => [{ value: NONE, label: t('spaces.bookable.colour-none') }, ...COLOURS.map(c => ({ value: c, label: t(`spaces.colours.${c}`) }))])
const venueItems = computed(() => [{ value: NONE, label: t('spaces.bookables.no-home-venue') }, ...(data.value?.venues ?? []).map(v => ({ value: v.id, label: v.name }))])
const detailsForm = useFormRef('detailsForm')

async function saveDetails() {
  refusal.value = null
  const b = data.value!.bookable
  const v = details.value
  try {
    await $api(`/api/spaces/bookables/${b.id}`, {
      method: 'PUT',
      body: {
        ...(b.kind === 'resource' ? { name: v.name.trim(), homeVenueId: v.homeVenueId, control: v.control } : {}),
        approval: v.approval,
        approvalNote: v.approvalNote.trim() || null,
        externalContact: external.value ? v.externalContact.trim() || null : null,
        guidance: v.guidance.trim() || null,
        colour: v.colour,
        maxLengthMinutes: v.maxLengthMinutes,
        requirements: b.requirements,
      },
    })
    toast.add({ title: t('spaces.bookable.saved', { name: b.kind === 'resource' ? v.name.trim() : b.name }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// ---- Hours: a week in the theatre's order, each day a list of spans.

const WEEK = computed(() => data.value?.weekStarts === 'sunday' ? [7, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 7])
const alwaysOpen = ref(false)
const days = ref<Record<number, { opensAt: string, closesAt: string }[]>>({})
function loadHours() {
  alwaysOpen.value = data.value?.bookable.alwaysOpen ?? false
  const next: Record<number, { opensAt: string, closesAt: string }[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }
  for (const h of data.value?.hours ?? []) next[h.weekday]!.push({ opensAt: h.opensAt, closesAt: h.closesAt === '24:00' ? '00:00' : h.closesAt })
  days.value = next
}
watch(() => data.value?.hours, loadHours, { immediate: true })
const addSpan = (day: number) => days.value[day]!.push({ opensAt: '09:00', closesAt: '17:00' }) // not-policy: a new opening's starting times
function timeOf(value: string) {
  try { return value ? parseTime(value) : undefined }
  catch { return undefined }
}
const clockOf = (value: unknown) => value ? String(value).slice(0, 5) : '' // not-policy: HH:MM
const removeSpan = (day: number, i: number) => days.value[day]!.splice(i, 1)
function copyDay(from: number, to: number[]) {
  for (const day of to) if (day !== from) days.value[day] = days.value[from]!.map(s => ({ ...s }))
}
const copyItems = (day: number): DropdownMenuItem[][] => [[
  { label: t('spaces.hours.copy-weekdays'), onSelect: () => copyDay(day, [1, 2, 3, 4, 5]) },
  { label: t('spaces.hours.copy-all'), onSelect: () => copyDay(day, [1, 2, 3, 4, 5, 6, 7]) },
]]
const hoursChanged = computed(() => {
  const now = Object.entries(days.value).flatMap(([d, spans]) => spans.map(s => `${d}-${s.opensAt}-${s.closesAt}`)).sort().join()
  const was = (data.value?.hours ?? []).map(h => `${h.weekday}-${h.opensAt}-${h.closesAt === '24:00' ? '00:00' : h.closesAt}`).sort().join()
  return now !== was || alwaysOpen.value !== data.value?.bookable.alwaysOpen
})

async function saveHours() {
  refusal.value = null
  const hours = Object.entries(days.value).flatMap(([d, spans]) => spans.map(s => ({ weekday: Number(d), opensAt: s.opensAt, closesAt: s.closesAt === '00:00' ? '24:00' : s.closesAt })))
  try {
    await $api(`/api/spaces/bookables/${id.value}/hours`, { method: 'PUT', body: { alwaysOpen: alwaysOpen.value, hours } })
    toast.add({ title: t('spaces.hours.saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// ---- Purposes here

const here = ref<PurposeHere[]>([])
watch(() => data.value?.purposes, (p) => { here.value = (p ?? []).map(x => ({ ...x })) }, { immediate: true })
const hereItems = (p: PurposeHere) => [
  { value: 'follow', label: t('spaces.bookable.purposes.follow', { approval: t(`spaces.purposes.approval.${p.approval}`) }) },
  { value: 'automatic', label: t('spaces.purposes.approval.automatic') },
  { value: 'approval', label: t('spaces.purposes.approval.approval') },
]
const setHere = (p: PurposeHere, v: string) => { p.here = v === 'follow' ? null : v as 'automatic' | 'approval' }

async function savePurposes() {
  refusal.value = null
  try {
    await $api(`/api/spaces/bookables/${id.value}/purposes`, { method: 'PUT', body: { purposes: here.value.map(p => ({ purposeId: p.purposeId, allowed: p.allowed, approval: p.here })) } })
    toast.add({ title: t('spaces.bookable.purposes.saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// ---- State

async function move(to: 'active' | 'paused' | 'archived') {
  refusal.value = null
  const b = data.value!.bookable
  const from = b.state
  try {
    await $api(`/api/spaces/bookables/${b.id}/state`, { method: 'POST', body: { to } })
    undo.offer(t(`spaces.bookable.moved.${to}`, { name: b.name }), async () => {
      await $api(`/api/spaces/bookables/${b.id}/state`, { method: 'POST', body: { to: from } })
      await refresh()
    })
    if (to === 'archived') await navigateTo('/admin/modules/spaces/bookables')
    else await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const actions = computed<DropdownMenuItem[][]>(() => {
  const b = data.value?.bookable
  if (!b || b.state === 'archived') return []
  return [
    [b.state === 'active'
      ? { label: t('spaces.bookable.pause'), icon: 'i-lucide-pause', onSelect: () => { void move('paused') } }
      : { label: t('spaces.bookable.resume'), icon: 'i-lucide-play', onSelect: () => { void move('active') } }],
    [{ label: t('spaces.bookable.archive'), icon: 'i-lucide-archive', color: 'error', onSelect: () => { void move('archived') } }],
  ]
})
const summary = computed(() => {
  const b = data.value?.bookable
  if (!b) return []
  return [
    { label: t('spaces.bookable.summary.kind'), value: t(`spaces.bookable.kind.${b.kind}`) },
    { label: t('spaces.bookables.control.label'), value: t(`spaces.bookables.control.${b.control}`) },
    { label: t('spaces.bookable.summary.hours'), value: b.alwaysOpen ? t('spaces.hours.always-open') : data.value!.hours.length ? t('spaces.bookable.summary.set') : t('spaces.bookable.summary.none') },
    ...(b.capacity ? [{ label: t('spaces.bookable.summary.capacity'), value: String(b.capacity) }] : []),
  ]
})
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageRecord
        :title="d.bookable.name"
        :status="{ label: t(`spaces.bookables.state.${d.bookable.state}`), tone: STATE_TONE[d.bookable.state] }"
        :actions="actions"
        :summary="summary"
        record-type="spaces.bookable"
        :record-id="d.bookable.id"
        :tabs="tabs"
        :trail="trail"
      >
        <template #tab-details>
          <UForm
            id="spaces-bookable-details"
            ref="detailsForm"
            class="max-w-2xl space-y-4"
            :state="details"
            :validate="() => d.bookable.kind === 'resource' ? needs({ name: details.name }) : []"
            novalidate
            @submit="saveDetails"
          >
            <RefusalNotice :refusal="refusal" />
            <template v-if="d.bookable.kind === 'resource'">
              <UFormField
                name="name"
                :label="t('spaces.bookables.name')"
                required
              >
                <UInput
                  v-model="details.name"
                  maxlength="80"
                />
              </UFormField>
              <UFormField
                :label="t('spaces.bookables.home-venue')"
                :help="t('spaces.bookables.home-venue-help')"
              >
                <USelect
                  :model-value="details.homeVenueId ?? NONE"
                  :items="venueItems"
                  @update:model-value="details.homeVenueId = $event === NONE ? null : $event as string"
                />
              </UFormField>
              <UFormField :label="t('spaces.bookables.control.label')">
                <USelect
                  v-model="details.control"
                  :items="controlItems"
                />
              </UFormField>
            </template>
            <UAlert
              v-else-if="external"
              color="neutral"
              variant="subtle"
              icon="i-lucide-info"
              :description="t('spaces.bookable.external-space')"
            />
            <UFormField
              v-if="external"
              :label="t('spaces.bookables.contact')"
              :help="t('spaces.bookables.contact-help')"
            >
              <UInput
                v-model="details.externalContact"
                maxlength="200"
              />
            </UFormField>
            <UFormField
              :label="t('spaces.bookable.approval.label')"
              :help="external ? t('spaces.bookable.approval.external-help') : t('spaces.bookable.approval.help')"
            >
              <USelect
                v-model="details.approval"
                :items="approvalItems"
              />
            </UFormField>
            <UFormField
              :label="t('spaces.bookables.approval-note')"
              :help="t('spaces.bookables.approval-note-help')"
            >
              <UTextarea
                v-model="details.approvalNote"
                maxlength="500"
                :rows="2"
              />
            </UFormField>
            <UFormField
              :label="t('spaces.bookable.guidance')"
              :help="t('spaces.bookable.guidance-help')"
            >
              <UTextarea
                v-model="details.guidance"
                maxlength="1000"
                :rows="3"
              />
            </UFormField>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField :label="t('spaces.bookable.colour')">
                <USelect
                  :model-value="details.colour ?? NONE"
                  :items="colourItems"
                  @update:model-value="details.colour = $event === NONE ? null : $event as Bookable['colour']"
                >
                  <template #item-leading="{ item }">
                    <span
                      :class="['size-3 rounded-sm border', (item as { value: string }).value]"
                      style="background: var(--cal-fill); border-color: var(--cal-edge)"
                    />
                  </template>
                </USelect>
              </UFormField>
              <UFormField
                :label="t('spaces.bookable.max-length')"
                :help="t('spaces.bookable.max-length-help')"
              >
                <DefaultedMinutes
                  v-model="details.maxLengthMinutes"
                  :fallback="d.maxLengthMinutes"
                  :min="15"
                  :max="1440"
                  :label="t('spaces.bookable.max-length')"
                />
              </UFormField>
            </div>
            <UButton
              type="submit"
              :loading="detailsForm?.loading"
              :disabled="d.bookable.state === 'archived'"
              :label="t('spaces.save')"
            />
          </UForm>
        </template>

        <template #tab-hours>
          <div class="max-w-2xl space-y-4">
            <RefusalNotice :refusal="refusal" />
            <UCheckbox
              v-model="alwaysOpen"
              :label="t('spaces.hours.always-open')"
              :description="t('spaces.hours.always-open-help')"
            />
            <RecordList
              v-if="!alwaysOpen"
              :label="t('spaces.hours.week')"
            >
              <RecordListItem
                v-for="day in WEEK"
                :key="day"
                :name="t(`spaces.weekdays.${day}`)"
                :description="days[day]!.length ? undefined : t('spaces.hours.closed')"
                align="start"
              >
                <template #below>
                  <div
                    v-for="(span, i) in days[day]"
                    :key="i"
                    class="mt-2 flex flex-wrap items-center gap-2"
                  >
                    <UInputTime
                      :model-value="timeOf(span.opensAt)"
                      :hour-cycle="24"
                      :aria-label="t('spaces.hours.opens', { day: t(`spaces.weekdays.${day}`) })"
                      @update:model-value="span.opensAt = clockOf($event)"
                    />
                    <span class="text-sm text-muted">{{ t('spaces.hours.to') }}</span>
                    <UInputTime
                      :model-value="timeOf(span.closesAt)"
                      :hour-cycle="24"
                      :aria-label="t('spaces.hours.closes', { day: t(`spaces.weekdays.${day}`) })"
                      @update:model-value="span.closesAt = clockOf($event)"
                    />
                    <IconButton
                      icon="i-lucide-x"
                      size="sm"
                      :label="t('spaces.hours.remove', { day: t(`spaces.weekdays.${day}`) })"
                      @click="removeSpan(day, i)"
                    />
                  </div>
                </template>
                <div class="flex gap-1">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    icon="i-lucide-plus"
                    :label="t('spaces.hours.add')"
                    :aria-label="t('spaces.hours.add-to', { day: t(`spaces.weekdays.${day}`) })"
                    @click="addSpan(day)"
                  />
                  <UDropdownMenu :items="copyItems(day)">
                    <IconButton
                      icon="i-lucide-copy"
                      size="sm"
                      :label="t('spaces.hours.copy', { day: t(`spaces.weekdays.${day}`) })"
                    />
                  </UDropdownMenu>
                </div>
              </RecordListItem>
            </RecordList>
            <p class="text-sm text-muted">
              {{ t('spaces.hours.midnight') }}
            </p>
            <UButton
              :label="t('spaces.save')"
              :disabled="!hoursChanged || d.bookable.state === 'archived'"
              loading-auto
              @click="saveHours"
            />
          </div>
        </template>

        <template #tab-purposes>
          <div class="max-w-3xl space-y-4">
            <RefusalNotice :refusal="refusal" />
            <EmptyState
              v-if="!here.length"
              :title="t('spaces.bookable.purposes.empty')"
              icon="i-lucide-list-ordered"
            >
              <UButton
                to="/admin/modules/spaces/purposes"
                :label="t('spaces.bookable.purposes.set-up')"
              />
            </EmptyState>
            <RecordList
              v-else
              :label="t('spaces.bookable.tabs.purposes')"
            >
              <RecordListItem
                v-for="p in here"
                :key="p.purposeId"
                :name="p.name"
                :description="t('spaces.purposes.tier', { tier: p.tier })"
              >
                <template #leading>
                  <UCheckbox
                    v-model="p.allowed"
                    :aria-label="t('spaces.bookable.purposes.allowed', { name: p.name })"
                  />
                </template>
                <USelect
                  v-if="p.allowed"
                  :model-value="p.here ?? 'follow'"
                  :items="hereItems(p)"
                  class="sm:w-64"
                  :aria-label="t('spaces.bookable.purposes.approval-for', { name: p.name })"
                  @update:model-value="setHere(p, $event as string)"
                />
                <span
                  v-else
                  class="text-sm text-muted"
                >{{ t('spaces.bookable.purposes.not-here') }}</span>
              </RecordListItem>
            </RecordList>
            <UButton
              v-if="here.length"
              :label="t('spaces.save')"
              :disabled="d.bookable.state === 'archived'"
              loading-auto
              @click="savePurposes"
            />
          </div>
        </template>
        <template #tab-people>
          <SpacesBookablePeople :bookable-id="id" />
        </template>
      </PageRecord>
    </template>
  </DataBoundary>
</template>
