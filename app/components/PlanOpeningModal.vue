<script setup lang="ts">
import { fromLondonWallClock } from '#shared/utils/london'
import { daysAfter } from '#shared/utils/membership'
import { MAX_PAGE_SIZE } from '#shared/utils/pagination'
import { BAR_OPENING_LABEL_LIMIT, SAME_TIME_REFUSAL } from '#shared/utils/rota-openings'
import { showNightOf } from '#shared/utils/show-night'
import type { TemplateSlot } from '#shared/utils/rota'

// Planning a bar opening, from Bar openings or from its night on the rota board (E-130, 0252).
const props = defineProps<{ open: boolean, evening?: string }>()
const emit = defineEmits<{ close: [], planned: [] }>()

interface VenueTemplate { venueId: string, venueName: string, archived: boolean, slots: TemplateSlot[] }

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const saving = ref(false)
// Set when the route warns of an overlapping opening; going ahead resends with the flag (0215).
const overlapWarned = ref(false)

// Only venues whose template staffs a bar: anywhere else stamps nothing, and offering it would
// be a form that always refuses (E-130 criterion 2).
const { data: templates } = await useAsyncData(
  'rota-openings-venues',
  () => request<{ venues: VenueTemplate[] }>('/api/admin/rota/templates', { query: { pageSize: MAX_PAGE_SIZE } }),
  { default: () => ({ venues: [] as VenueTemplate[] }) },
)

const venueOptions = computed(() => templates.value.venues
  .filter(venue => !venue.archived && venue.slots.some(slot => slot.role === 'BAR'))
  .map(venue => ({ label: venue.venueName, value: venue.venueId })))

const plan = reactive({ venueId: '', evening: '', opensAt: '18:00', closesAt: '23:00', label: '' })

// One bar to open is the usual case, and there is nothing to choose between (0140).
watch(venueOptions, (options) => {
  if (!plan.venueId && options.length === 1) plan.venueId = options[0]!.value
}, { immediate: true })

// Opened from a night, the evening is that night's; the rest of the form is kept between openings.
watch(() => [props.open, props.evening] as const, ([open, evening]) => {
  if (!open) return
  failure.value = null
  overlapWarned.value = false
  if (evening) plan.evening = evening
}, { immediate: true })

// A wall-clock time as typed, or null: an empty field is a missing answer, never midnight.
function clockParts(value: string): [number, number] | null {
  const [hour, minute] = value.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return [hour!, minute!]
}

// The night is the evening's own show night, worked out from the instant rather than typed: a bar
// opening at 00:30 belongs to the night before, and the write path refuses a pair that disagrees.
function instantsFor(): { night: string, startsAt: number, endsAt: number } | 'same' | null {
  const [year, month, day] = plan.evening.split('-').map(Number)
  const opensAt = clockParts(plan.opensAt)
  const closesAt = clockParts(plan.closesAt)
  if (!year || !month || !day || !opensAt || !closesAt) return null

  const opens = fromLondonWallClock(year, month, day, opensAt[0], opensAt[1])
  if (opensAt[0] === closesAt[0] && opensAt[1] === closesAt[1]) return 'same'
  const sameDay = fromLondonWallClock(year, month, day, closesAt[0], closesAt[1])
  // A bar closing earlier on the clock than it opened closes the next morning, on the next London
  // day rather than this instant plus 86400: a clock-change night is not that long (0014).
  const [nextYear, nextMonth, nextDay] = daysAfter(plan.evening, 1).split('-').map(Number)
  const closes = sameDay <= opens
    ? fromLondonWallClock(nextYear!, nextMonth!, nextDay!, closesAt[0], closesAt[1])
    : sameDay
  return { night: showNightOf(opens), startsAt: Math.floor(opens.getTime() / 1000), endsAt: Math.floor(closes.getTime() / 1000) }
}

async function submitPlan(anyway = false): Promise<void> {
  const when = instantsFor()
  if (!when || when === 'same') {
    failure.value = when === 'same' ? SAME_TIME_REFUSAL : 'Give the evening, the time the bar opens and the time it closes'
    overlapWarned.value = false
    return
  }
  saving.value = true
  failure.value = null
  overlapWarned.value = false
  try {
    const answer = await $fetch<{ stamped: number }>('/api/rota/openings', {
      method: 'POST',
      body: { venueId: plan.venueId, label: plan.label.trim(), ...when, overlapping: anyway || undefined },
    })
    toast.add({
      title: 'Bar opening planned',
      description: `${plural(answer.stamped, 'bar slot')} stamped from the venue's template.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    plan.label = ''
    emit('planned')
  }
  catch (error) {
    failure.value = refusalText(error)
    overlapWarned.value = refusalData<{ overlap?: boolean }>(error)?.overlap === true
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    title="Plan a bar opening"
    description="The evening, the venue and what to call it. Bar slots are stamped from the venue's template; a venue with no bar row stamps nothing and says so."
    @update:open="value => { if (!value) emit('close') }"
  >
    <template #body>
      <UAlert
        v-if="failure"
        data-test="failure"
        class="mb-4"
        :color="overlapWarned ? 'warning' : 'error'"
        variant="subtle"
        :description="failure"
      />
      <div class="space-y-4">
        <UFormField
          label="Venue"
          required
        >
          <USelectMenu
            v-model="plan.venueId"
            :items="venueOptions"
            placeholder="Choose a venue"
            value-key="value"
            data-test="opening-venue"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Evening"
          required
        >
          <DateField
            v-model="plan.evening"
            data-test="opening-evening"
            class="w-full"
          />
        </UFormField>
        <div class="grid grid-cols-2 gap-4">
          <UFormField
            label="Opens"
            required
          >
            <UInput
              v-model="plan.opensAt"
              type="time"
              data-test="opening-opens"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Closes"
            required
          >
            <UInput
              v-model="plan.closesAt"
              type="time"
              data-test="opening-closes"
              class="w-full"
            />
          </UFormField>
        </div>
        <UFormField
          label="What it is"
          required
          hint="Stands in for a show title on the rota"
        >
          <UInput
            v-model="plan.label"
            :maxlength="BAR_OPENING_LABEL_LIMIT"
            placeholder="A society social"
            data-test="opening-label"
            class="w-full"
          />
        </UFormField>
        <div class="flex gap-2">
          <UButton
            type="button"
            :loading="saving"
            data-test="opening-submit"
            @click="submitPlan()"
          >
            Plan the opening
          </UButton>
          <UButton
            v-if="overlapWarned"
            type="button"
            color="warning"
            variant="soft"
            :loading="saving"
            data-test="opening-submit-anyway"
            @click="submitPlan(true)"
          >
            Plan the opening anyway
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
