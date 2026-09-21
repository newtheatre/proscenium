<script setup lang="ts">
import { describePurpose } from '#shared/utils/bookings'
import { fromLondonWallClock } from '#shared/utils/london'
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: 'member', middleware: 'signed-in', docs: '/docs/members/other-rooms' })

interface Failure { reason: string, says: string }

const route = useRoute()
const toast = useToast()
const request = useRequestFetch()

// The screen's own shape: a day and two wall clocks, which become the instants the write path
// validates on the way out (C-120 criterion 7, 0014).
const form = z.object({
  title: z.string().trim().min(1, 'Say what the room is for').max(200),
  purpose: z.string().min(1, 'Say what the room is for'),
  attendees: z.number().int().positive().optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a day'),
  from: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a start time'),
  to: z.string().regex(/^\d{2}:\d{2}$/, 'Choose an end time'),
  preferredSpaceId: z.string().optional(),
  notes: z.string().trim().max(1000),
}).refine(ask => ask.to > ask.from, {
  path: ['to'],
  message: 'A booking ends after it starts',
})

type ExternalForm = z.output<typeof form>

const state = reactive<ExternalForm>({
  title: '',
  purpose: '',
  attendees: undefined,
  day: String(route.query.day ?? ''),
  from: String(route.query.at ?? '18:00'),
  to: addMinutes(String(route.query.at ?? '18:00'), 120),
  preferredSpaceId: undefined,
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

// A purpose off the query string is a suggestion, and it only lands if the vocabulary still holds
// it: an unknown one would be sent and refused, or worse, warned about against nothing.
if (rules.value.purposes.includes(String(route.query.purpose ?? ''))) {
  state.purpose = String(route.query.purpose)
}

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

// The server refuses NO_MEMBERSHIP outright (0031), so the form's job is to say where to put it
// right rather than to invent its own wording (A-129).
const needsMembership = computed(() => failures.value.some(failure => failure.reason === 'NO_MEMBERSHIP'))

async function ask(event: FormSubmitEvent<ExternalForm>): Promise<void> {
  saving.value = true
  failures.value = []
  try {
    const answer = await $fetch<{ warning: string | null }>('/api/rooms/external-requests', {
      method: 'POST',
      body: {
        title: event.data.title,
        purpose: event.data.purpose,
        attendees: event.data.attendees ?? null,
        startsAt: instantOf(event.data.day, event.data.from),
        endsAt: instantOf(event.data.day, event.data.to),
        preferredSpaceId: event.data.preferredSpaceId ?? null,
        notes: event.data.notes,
      },
    })

    toast.add({
      title: 'Asked for',
      description: answer.warning ?? 'The Theatre Manager fills in the form for it next.',
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

useSeoMeta({ title: 'Book a room not listed here' })
</script>

<template>
  <UContainer :class="MEMBER_PAGE_WORKING">
    <UPageHeader
      title="Book a room not listed here"
      description="For when nothing of ours suits. The Theatre Manager decides which room we get, and this is a request rather than a booking."
    />

    <UAlert
      class="mt-6"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="Nothing here is held for you"
      description="The Theatre Manager fills in the Students' Union's form, and they answer in their own time. You may say which room you would like, but they may give us a different one."
      data-test="external-warning"
    />

    <UPageCard class="mt-8">
      <UForm
        :schema="form"
        :state="state"
        class="space-y-5"
        data-test="external-form"
        @submit="ask"
      >
        <UFormField
          label="What it is for"
          name="title"
          required
          description="Shown to the Theatre Manager and written on the form."
        >
          <UInput
            v-model="state.title"
            class="w-full"
            data-test="external-title"
          />
        </UFormField>

        <UFormField
          label="What the room is for"
          name="purpose"
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
          name="day"
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
            name="from"
            required
          >
            <TimeField
              v-model="state.from"
              class="w-full"
              data-test="external-from"
            />
          </UFormField>
          <UFormField
            label="Until"
            name="to"
            required
          >
            <TimeField
              v-model="state.to"
              class="w-full"
              data-test="external-to"
            />
          </UFormField>
        </div>

        <UFormField
          label="How many people"
          name="attendees"
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
          name="preferredSpaceId"
          hint="Optional"
          description="A preference, not a promise. If we know a room is no good for what you are doing, you are told here."
        >
          <SpacePicker
            v-model="state.preferredSpaceId"
            :purpose="state.purpose || null"
          />
        </UFormField>

        <UFormField
          label="Anything else whoever manages it should know"
          name="notes"
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
            <UButton
              v-if="needsMembership"
              class="mt-2"
              size="sm"
              variant="subtle"
              to="/account/membership"
              data-test="external-membership-link"
            >
              Tell us about your membership
            </UButton>
          </template>
        </UAlert>

        <div class="flex flex-wrap gap-2">
          <UButton
            type="submit"
            :loading="saving"
            data-test="external-submit"
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
      </UForm>
    </UPageCard>
  </UContainer>
</template>
