<script setup lang="ts">
// Adding a run of performances (C-04; run presets, Matt 2026-11-17): first and last date and the
// start times, one line each with the days it runs on, so a matinee can be on Saturdays only. A
// preset fills the start times in: the space's usual one, else the theatre's. The show's defaults sit
// behind one line, as on Add performance. Every performance the run would make is listed before
// anything is saved: those that are past, clash or fall in a closure are left out, and any other can
// be unticked. A long run is made by a job; the production's performances section follows it. The
// dates start from the day after the production's last performance, else its season.
import { noOverrides, overrideErrors, rowSlots, slotRows, slotsInWords, type RunSlot, type ShowDefaultValues, type ShowOverrides, type SlotRow } from '../utils/show-defaults'

interface Planned { startsAt: number, endsAt: number, doorsAt: number | null, operatingDay: string, problem: 'past' | 'exists' | 'clash' | 'closed' | null, reason: string | null }
interface Space { value: string, label: string, venueId: string, runPresetId: string | null }
interface Preset { id: string, name: string, slots: RunSlot[] }

const { t } = useT()
const props = defineProps<{
  productionId: string
  spaces: Space[]
  presets: Preset[]
  defaults: { usualSpaceId: string | null, usualPreset: string | null, scheduleRuns: boolean, sellsHere: boolean }
  defaultsIn: (spaceId: string) => ShowDefaultValues
  /** The first and last date a new run starts from, as "2027-09-01", or null for none. */
  suggested?: { start: string, end: string } | null
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ 'added': [answer: { created: number, ids: string[] } | { run: { id: string, total: number } }], 'presets-changed': [] }>()

const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const dates = useDates()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const NONE = 'none'
const form = ref({ spaceId: '', presetId: NONE, dates: { start: '', end: '' }, rows: [] as SlotRow[], scheduled: true })
const overrides = ref<ShowOverrides>(noOverrides())
const planned = ref<(Planned & { keep: boolean })[] | null>(null)
const busy = ref(false)
const kept = computed(() => (planned.value ?? []).filter(p => !p.problem && p.keep))
const marked = computed(() => (planned.value ?? []).filter(p => p.problem).length)
const unticked = computed(() => (planned.value ?? []).filter(p => !p.problem && !p.keep).length)
/** What the list adds, in a sentence; when it adds nothing, why. */
const tally = computed(() => {
  const list = planned.value ?? []
  if (!list.length) return 'The pattern makes no performances on those dates. Change the pattern.'
  if (list.every(p => p.problem === 'exists')) return t('core.counts.all-exist', { count: list.length })
  if (list.every(p => p.problem)) return 'None of these can be added. Change the pattern to try other dates.'
  const left = marked.value + unticked.value
  const added = left ? `${kept.value.length} to add, ${left} left out.` : `${kept.value.length} to add.`
  return kept.value.length ? `${added} Untick any you don't want.` : `${added} Tick the ones to add.`
})
/** Whether anything in the list could be added, ticked or not. */
const addable = computed(() => (planned.value ?? []).some(p => !p.problem))
const presetItems = computed(() => [{ value: NONE, label: 'No preset' }, ...props.presets.map(p => ({ value: p.id, label: p.name }))])
const space = () => props.spaces.find(s => s.value === form.value.spaceId)
const shown = computed(() => form.value.spaceId ? props.defaultsIn(form.value.spaceId) : null)
const slots = computed(() => rowSlots(form.value.rows))
const BLANK: SlotRow[] = [{ time: '19:30', days: ['2', '3', '4', '5', '6'] }] // not-policy: a fresh run's first line, Tuesday to Saturday evenings

/** The preset a space starts from: its own usual one, else the theatre's. */
function usualFor(spaceId: string): string {
  const id = props.spaces.find(s => s.value === spaceId)?.runPresetId ?? props.defaults.usualPreset
  return id && props.presets.some(p => p.id === id) ? id : NONE
}
function usePreset(id: string) {
  form.value.presetId = id
  const preset = props.presets.find(p => p.id === id)
  form.value.rows = preset ? slotRows(preset.slots) : BLANK.map(r => ({ ...r, days: [...r.days] }))
}

watch(open, (v) => {
  if (!v) return
  refusal.value = null
  planned.value = null
  overrides.value = noOverrides()
  if (!form.value.dates.start && props.suggested) form.value.dates = { ...props.suggested }
  // The production's usual space first, else the first one listed.
  form.value.spaceId ||= props.spaces.find(s => s.value === props.defaults.usualSpaceId)?.value ?? props.spaces[0]?.value ?? ''
  form.value.scheduled = props.defaults.scheduleRuns
  usePreset(usualFor(form.value.spaceId))
}, { immediate: true })
// A new space starts from its own usual preset, unless the start times have been changed by hand.
watch(() => form.value.spaceId, (id, was) => {
  if (!was || !id) return
  const before = props.presets.find(p => p.id === form.value.presetId)
  if (!before || JSON.stringify(rowSlots(slotRows(before.slots))) === JSON.stringify(slots.value)) usePreset(usualFor(id))
})
// Any change to the pattern needs a fresh preview before it can be added.
watch([form, overrides], () => { planned.value = null }, { deep: true })

/** The start times differ from the chosen preset's, so they could be saved as one. */
const edited = computed(() => {
  const preset = props.presets.find(p => p.id === form.value.presetId)
  return !!slots.value.length && (!preset || JSON.stringify(rowSlots(slotRows(preset.slots))) !== JSON.stringify(slots.value))
})

async function preview() {
  const s = space()
  if (!s) return
  refusal.value = null
  busy.value = true
  try {
    const answer = await $api<{ performances: Planned[] }>(`/api/core/productions/${props.productionId}/performances/plan` as string, {
      method: 'POST',
      body: { venueId: s.venueId, spaceId: s.value, from: form.value.dates.start, to: form.value.dates.end || form.value.dates.start, slots: slots.value, minutes: overrides.value.runningMinutes, doorsBeforeMinutes: overrides.value.doorsBeforeMinutes },
    })
    planned.value = answer.performances.map(p => ({ ...p, keep: true }))
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}

async function add() {
  const s = space()
  if (!s || !kept.value.length) return
  const o = overrides.value
  refusal.value = null
  busy.value = true
  try {
    const answer = await $api<{ created: number, ids: string[] } | { run: { id: string, total: number } }>(`/api/core/productions/${props.productionId}/performances/run` as string, {
      method: 'POST',
      body: {
        venueId: s.venueId,
        spaceId: s.value,
        scheduled: form.value.scheduled,
        capacity: o.capacity,
        intervalCount: o.intervalCount,
        intervalMinutes: o.intervalMinutes,
        externalBookingUrl: o.bookedElsewhere ? o.externalBookingUrl.trim() || null : null,
        performances: kept.value.map(({ startsAt, endsAt, doorsAt }) => ({ startsAt, endsAt, doorsAt })),
      },
    })
    open.value = false
    // The next run starts from after this one.
    form.value.dates = { start: '', end: '' }
    emit('added', answer)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}

// Saving the start times as a preset, for anyone who adds runs.
const saving = ref(false)
const presetName = ref('')
const saveRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
function startSave() {
  presetName.value = ''
  saveRefusal.value = null
  saving.value = true
}
async function savePreset() {
  saveRefusal.value = null
  try {
    const answer = await $api<{ id: string }>(`/api/core/productions/${props.productionId}/run-presets` as string, { method: 'POST', body: { name: presetName.value.trim(), slots: slots.value } })
    saving.value = false
    emit('presets-changed')
    toast.add({ title: 'Preset saved', color: 'success' })
    // Once the list has the new preset, it is the one chosen.
    const stop = watch(() => props.presets, (list) => {
      if (!list.some(p => p.id === answer.id)) return
      form.value.presetId = answer.id
      stop()
    })
  }
  catch (e) {
    saveRefusal.value = toRefusal(e)
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Add a run"
    description="Every performance the run would make is listed first. Any that are past, already on the list, clash or fall in a closure are left out."
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <UForm
        id="performance-run"
        :state="form"
        :validate="() => [...needs({ spaceId: form.spaceId, dates: form.dates.start, slots: slots.length > 0 }), ...overrideErrors(overrides, shown, defaults.sellsHere)]"
        class="space-y-4"
        novalidate
        @submit="planned ? add() : preview()"
      >
        <RefusalNotice :refusal="refusal" />
        <template v-if="!planned">
          <UFormField
            v-if="presets.length"
            label="Start from a preset"
            help="Fills in the start times below. Change anything you like for this run."
          >
            <USelectMenu
              :model-value="form.presetId"
              :items="presetItems"
              value-key="value"
              icon="i-lucide-calendar-clock"
              @update:model-value="usePreset(String($event))"
            />
          </UFormField>
          <UFormField
            label="Space"
            name="spaceId"
            required
          >
            <USelect
              v-model="form.spaceId"
              :items="spaces"
            />
          </UFormField>
          <UFormField
            label="First and last date"
            name="dates"
            required
          >
            <FieldDateRange v-model="form.dates" />
          </UFormField>
          <UFormField
            label="Performances"
            help="One line for each start time, with the days it runs on."
            name="slots"
            required
          >
            <RunSlotsField v-model="form.rows" />
          </UFormField>
          <ShowDefaults
            v-if="shown"
            v-model="overrides"
            :defaults="shown"
            :sells-here="defaults.sellsHere"
            run
          />
          <UCheckbox
            v-model="form.scheduled"
            label="Schedule them now"
            description="Turn off to add them as drafts, to schedule one by one."
          />
        </template>

        <div
          v-else
          class="space-y-2"
        >
          <p class="text-sm">
            {{ tally }}
          </p>
          <div class="max-h-96 overflow-y-auto">
            <RecordList label="The performances this would add">
              <RecordListItem
                v-for="p in planned"
                :key="p.startsAt"
                :muted="!!p.problem || !p.keep"
              >
                <template #leading>
                  <UCheckbox
                    :model-value="!p.problem && p.keep"
                    :disabled="!!p.problem"
                    :aria-label="dates.dateTime(p.startsAt)"
                    @update:model-value="p.keep = !!$event"
                  />
                </template>
                <template #name>
                  <span :class="p.problem || !p.keep ? 'font-normal line-through' : 'font-normal'">{{ dates.dateTime(p.startsAt) }}</span>
                </template>
                <span
                  v-if="p.reason"
                  class="text-sm text-error"
                >{{ p.reason }}</span>
              </RecordListItem>
            </RecordList>
          </div>
        </div>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-2">
        <UButton
          v-if="!planned && edited"
          label="Save as a preset"
          icon="i-lucide-bookmark-plus"
          color="neutral"
          variant="ghost"
          @click="startSave"
        />
        <span v-else />
        <UButton
          v-if="!planned"
          type="submit"
          form="performance-run"
          label="Show the dates"
          :loading="busy"
        />
        <div
          v-else
          class="flex gap-2"
        >
          <UButton
            label="Change the pattern"
            :color="addable ? 'neutral' : undefined"
            :variant="addable ? 'outline' : 'solid'"
            @click="planned = null"
          />
          <UButton
            v-if="addable"
            type="submit"
            form="performance-run"
            :label="t('core.counts.add-performances', { count: kept.length })"
            :loading="busy"
            :disabled="!kept.length"
          />
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    v-model:open="saving"
    title="Save as a preset"
    description="Anyone who adds runs can start from it. Admins can change or delete it under Admin, Modules, Core."
  >
    <template #body>
      <UForm
        id="run-preset-save"
        :state="{ name: presetName }"
        :validate="() => needs({ name: presetName })"
        class="space-y-4"
        novalidate
        @submit="savePreset"
      >
        <RefusalNotice :refusal="saveRefusal" />
        <UFormField
          label="Name"
          name="name"
          required
        >
          <UInput
            v-model="presetName"
            maxlength="80"
            placeholder="Such as Evenings and a Saturday matinee"
          />
        </UFormField>
        <div class="rounded-md bg-elevated px-3 py-2 text-sm">
          <p class="font-medium">
            What it keeps
          </p>
          <p class="text-muted">
            {{ slotsInWords(slots) }}
          </p>
          <p class="mt-1 text-xs text-dimmed">
            Not the space, the dates or the show's defaults, which change from run to run.
          </p>
        </div>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="run-preset-save"
        label="Save preset"
      />
    </template>
  </UModal>
</template>
