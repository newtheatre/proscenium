<script setup lang="ts">
import { describePurpose } from '#shared/utils/bookings'
import { fromLondonWallClock } from '#shared/utils/london'

definePageMeta({ middleware: 'signed-in' })

interface Failure { reason: string, says: string }

const route = useRoute()
const toast = useToast()
const request = useRequestFetch()

const state = reactive({
  title: '',
  purpose: String(route.query.purpose ?? ''),
  attendees: undefined as number | undefined,
  day: String(route.query.day ?? ''),
  from: String(route.query.at ?? '18:00'),
  to: addMinutes(String(route.query.at ?? '18:00'), 120),
  preferredSpaceId: undefined as string | undefined,
  notes: '',
})

const saving = ref(false)
const failures = ref<Failure[]>([])

const { data: rules } = await useAsyncData(
  'external-policy',
  () => request<{ purposes: string[] }>('/api/rooms/policy'),
  { default: () => ({ purposes: [] as string[] }) },
)

const purposeOptions = computed(() =>
  rules.value.purposes.map(purpose => ({ label: describePurpose(purpose), value: purpose })))

function addMinutes(clock: string, minutes: number): string {
  const [hour, minute] = clock.split(':').map(Number)
  const total = Math.min(hour! * 60 + minute! + minutes, 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// The wall clock the member typed, turned into the instant it names in London (0014).
function instantOf(day: string, clock: string): string {
  const [year, month, date] = day.split('-').map(Number)
  const [hour, minute] = clock.split(':').map(Number)
  return fromLondonWallClock(year!, month!, date!, hour!, minute!).toISOString()
}

const ready = computed(() => Boolean(state.title.trim() && state.purpose && state.day && state.to > state.from))

async function ask(): Promise<void> {
  saving.value = true
  failures.value = []
  try {
    const answer = await $fetch<{ warning: string | null }>('/api/rooms/external-requests', {
      method: 'POST',
      body: {
        title: state.title,
        purpose: state.purpose,
        attendees: state.attendees ?? null,
        startsAt: instantOf(state.day, state.from),
        endsAt: instantOf(state.day, state.to),
        preferredSpaceId: state.preferredSpaceId ?? null,
        notes: state.notes,
      },
    })

    toast.add({
      title: 'Asked for',
      description: answer.warning ?? 'The Theatre Manager fills in the union\'s form next.',
      icon: 'i-lucide-check',
      color: answer.warning ? 'warning' : 'success',
    })
    await navigateTo('/rooms/mine')
  }
  catch (error) {
    const data = refusalData<{ failures?: Failure[] }>(error)
    failures.value = data?.failures ?? []
    if (failures.value.length === 0) toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

useSeoMeta({ title: 'Ask the union for a room' })
</script>

<template>
  <UContainer class="max-w-xl py-16">
    <UPageHeader
      title="Ask the union for a room"
      description="For when nothing of ours suits. The Students' Union decides which room we get, so this is a request rather than a booking."
    />

    <UAlert
      class="mt-6"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="Nothing here is held for you"
      description="The Theatre Manager fills in the union's form, and the union answers in their own time. You may say which room you would like, but they may give us a different one."
      data-test="external-warning"
    />

    <UPageCard class="mt-8">
      <div class="space-y-5">
        <UFormField
          label="What it is for"
          required
          description="Shown to the Theatre Manager and written on the union's form."
        >
          <UInput
            v-model="state.title"
            class="w-full"
            data-test="external-title"
          />
        </UFormField>

        <UFormField
          label="What the room is for"
          required
          description="What you need the room to be like. It is what decides whether a room they offer will suit."
        >
          <USelect
            v-model="state.purpose"
            :items="purposeOptions"
            value-key="value"
            placeholder="Choose what it is for"
            class="w-full"
            data-test="external-purpose"
          />
        </UFormField>

        <UFormField
          label="Day"
          required
        >
          <DateField
            v-model="state.day"
            data-test="external-day"
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            label="From"
            required
          >
            <UInput
              v-model="state.from"
              type="time"
              class="w-full"
              data-test="external-from"
            />
          </UFormField>
          <UFormField
            label="Until"
            required
          >
            <UInput
              v-model="state.to"
              type="time"
              class="w-full"
              data-test="external-to"
            />
          </UFormField>
        </div>

        <UFormField
          label="How many people"
          hint="Optional"
        >
          <UInputNumber
            v-model="state.attendees"
            :min="1"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="A room you would like"
          hint="Optional"
          description="A preference, not a promise. If we know a room is no good for what you are doing, you are told here."
        >
          <SpacePicker
            v-model="state.preferredSpaceId"
            :purpose="state.purpose || null"
          />
        </UFormField>

        <UFormField
          label="Anything else the union should know"
          hint="Optional"
        >
          <UTextarea
            v-model="state.notes"
            :rows="2"
            :maxlength="1000"
            class="w-full"
            data-test="external-notes"
          />
        </UFormField>

        <UAlert
          v-if="failures.length"
          color="error"
          variant="subtle"
          title="That cannot be asked for"
          data-test="external-failures"
        >
          <template #description>
            <ul class="mt-1 list-disc ps-4">
              <li
                v-for="failure in failures"
                :key="failure.reason"
              >
                {{ failure.says }}
              </li>
            </ul>
          </template>
        </UAlert>

        <div class="flex flex-wrap gap-2">
          <UButton
            :loading="saving"
            :disabled="!ready"
            data-test="external-submit"
            @click="ask"
          >
            Ask for it
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            to="/rooms"
          >
            Back to our own rooms
          </UButton>
        </div>
      </div>
    </UPageCard>
  </UContainer>
</template>
