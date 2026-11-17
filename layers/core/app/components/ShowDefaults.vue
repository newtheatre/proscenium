<!-- The show's defaults on the Add performance and Add a run windows (run presets, Matt 2026-11-17).
     Most performances keep them, so they are summed up on one line and the fields to change them sit
     behind it. Each field shows greyed the value it will take; a value typed in is for this
     performance or run only. Running time includes the intervals. -->
<script setup lang="ts">
import type { ShowDefaultValues, ShowOverrides } from '../utils/show-defaults'

const props = defineProps<{
  defaults: ShowDefaultValues
  /** For a run: no label, and "this run" in the wording. */
  run?: boolean
  /** Whether anything here sells tickets. When nothing does, every performance is booked elsewhere. */
  sellsHere: boolean
}>()
const model = defineModel<ShowOverrides>({ required: true })

/** A fresh set of overrides: everything at the show's defaults. */
const changed = computed(() => {
  const m = model.value
  return m.runningMinutes !== null || m.doorsBeforeMinutes !== null || m.intervalCount !== null || m.intervalMinutes !== null
    || m.capacity !== null || !!m.label.trim() || m.bookedElsewhere
})
const open = ref(changed.value)

const running = computed(() => model.value.runningMinutes ?? props.defaults.runningMinutes)
const intervals = computed(() => model.value.intervalCount ?? props.defaults.intervalCount)
const each = computed(() => model.value.intervalMinutes ?? props.defaults.intervalMinutes)
const doors = computed(() => model.value.doorsBeforeMinutes ?? props.defaults.doorsBeforeMinutes)
const seats = computed(() => model.value.capacity ?? props.defaults.capacity)
// The production's own link holds unless this one gives another; with nothing selling here, it is always booked elsewhere.
const locked = computed(() => !props.sellsHere || !!props.defaults.externalBookingUrl)
const elsewhere = computed(() => locked.value || model.value.bookedElsewhere)
const elsewhereHelp = computed(() => !props.sellsHere
  ? 'Nothing here sells tickets, so every performance is booked on another website.'
  : props.defaults.externalBookingUrl
    ? 'The production is booked on another website. Give a link here only if this one differs.'
    : 'Tickets are sold on another website, not here.')

const summary = computed(() => [
  minutesInWords(running.value),
  intervals.value ? `${intervals.value} interval${intervals.value === 1 ? '' : 's'} of ${minutesInWords(each.value)}` : 'no interval',
  `doors ${minutesInWords(doors.value)} before`,
  ...(seats.value !== null ? [`${seats.value} seats`] : []),
  ...(model.value.label.trim() ? [model.value.label.trim()] : []),
  ...(elsewhere.value ? ['booked elsewhere'] : []),
].join(' · '))
</script>

<template>
  <UCollapsible
    v-model:open="open"
    class="rounded-md border border-default"
  >
    <button
      type="button"
      class="flex w-full items-center gap-3 px-3 py-2 text-left"
    >
      <UIcon
        name="i-lucide-sliders-horizontal"
        class="size-4 shrink-0 text-muted"
      />
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-medium">The show's defaults</span>
        <span class="block text-sm text-muted">{{ summary }}</span>
      </span>
      <span class="shrink-0 text-sm text-muted max-sm:hidden">{{ open ? 'Hide' : run ? 'Change for this run' : 'Change for this one' }}</span>
      <UIcon
        :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="size-4 shrink-0 text-muted"
      />
    </button>
    <template #content>
      <div class="space-y-4 border-t border-default p-3">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            label="Running time"
            name="runningMinutes"
          >
            <MinutesInput
              v-model="model.runningMinutes"
              :placeholder="defaults.runningMinutes"
              :min="1"
              label="Running time"
            />
          </UFormField>
          <UFormField
            label="Doors open before"
            name="doorsBeforeMinutes"
          >
            <MinutesInput
              v-model="model.doorsBeforeMinutes"
              :placeholder="defaults.doorsBeforeMinutes"
              :max="180"
              label="Doors open before"
            />
          </UFormField>
          <UFormField
            label="Intervals"
            name="intervalCount"
          >
            <UInputNumber
              v-model="model.intervalCount"
              :placeholder="String(defaults.intervalCount)"
              :min="0"
              :max="10"
            />
          </UFormField>
          <UFormField
            label="Each interval"
            name="intervalMinutes"
          >
            <MinutesInput
              v-model="model.intervalMinutes"
              :placeholder="defaults.intervalMinutes"
              :max="120"
              label="Each interval"
            />
          </UFormField>
          <UFormField
            label="Capacity"
            name="capacity"
          >
            <UInputNumber
              v-model="model.capacity"
              :placeholder="defaults.capacity === null ? undefined : String(defaults.capacity)"
              :min="0"
            />
          </UFormField>
          <UFormField
            v-if="!run"
            label="Label"
            name="label"
          >
            <UInput
              v-model="model.label"
              placeholder="Such as Relaxed"
              maxlength="40"
            />
          </UFormField>
          <UCheckbox
            :model-value="elsewhere"
            :disabled="locked"
            label="Booked elsewhere"
            :description="elsewhereHelp"
            class="sm:col-span-1"
            @update:model-value="model.bookedElsewhere = !!$event"
          />
        </div>
        <UFormField
          v-if="elsewhere"
          label="Booking link"
          name="externalBookingUrl"
          :required="!defaults.externalBookingUrl && sellsHere"
        >
          <UInput
            v-model="model.externalBookingUrl"
            type="url"
            :placeholder="defaults.externalBookingUrl ?? 'https://'"
          />
        </UFormField>
      </div>
    </template>
  </UCollapsible>
</template>
