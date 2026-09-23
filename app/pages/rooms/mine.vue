<script setup lang="ts">
import { formatLondon, fromLondonWallClock, londonClock } from '#shared/utils/london'
import { SERIES_EDIT_REFUSAL, describePurpose, saysBookingState } from '#shared/utils/bookings'
import { saysExternalState } from '#shared/utils/external-requests'
import { REQUEST_REASON_LIMIT } from '#shared/utils/requests'
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: 'member', middleware: 'signed-in', docs: '/docs/my-nnt/my-room-bookings' })

interface Booking {
  id: string
  roomId: string
  room: string
  title: string
  tier: string
  purpose: string | null
  notes: string | null
  reason: string | null
  editable: boolean
  attendees: number | null
  startsAt: number
  endsAt: number
  status: string
  rejectionReason: string | null
  cancellable: boolean
  seriesId: string | null
  occurrence: number | null
  seriesLength: number | null
  bumpedReason: string | null
  bumpedToBookingId: string | null
  convertedToRequestId: string | null
}

interface Listing { when: string, items: Booking[], total: number }

const toast = useToast()
const request = useRequestFetch()
const when = ref<'upcoming' | 'past'>('upcoming')
const cancelling = ref<Booking | null>(null)
const working = ref(false)
const feedUrl = ref<string | null>(null)
const minting = ref(false)
const copied = ref(false)

// Their own record, shown to them rather than sprung on them (C-116 criterion 5).
const { data: standing } = await useAsyncData(
  'my-standing',
  () => request<{ count: number, standing: string, says: string }>('/api/rooms/standing'),
  { default: () => ({ count: 0, standing: 'CLEAR', says: '' }) },
)

const { data: feed } = await useAsyncData(
  'room-feed',
  () => request<{ exists: boolean }>('/api/account/room-feed'),
  { default: () => ({ exists: false }) },
)

// The plaintext exists only in the response that mints it, so a second visit cannot show the
// URL again: it can only replace it, which is what makes revoking one an ordinary action.
async function mintFeed(): Promise<void> {
  minting.value = true
  copied.value = false
  try {
    feedUrl.value = (await $fetch<{ url: string }>('/api/account/room-feed', { method: 'POST' })).url
    feed.value = { exists: true }
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    minting.value = false
  }
}

async function copyFeed(): Promise<void> {
  if (!feedUrl.value) return
  try {
    await navigator.clipboard.writeText(feedUrl.value)
    copied.value = true
  }
  catch {
    // A browser that refuses the clipboard leaves the URL on screen to copy by hand.
    copied.value = false
  }
}

interface UnlistedRequest {
  convertedToBookingId: string | null
  id: string
  title: string
  purpose: string
  startsAt: number
  endsAt: number
  status: string
  preferred: string | null
  assigned: string | null
  rejectionReason: string | null
  cancellable: boolean
}

const { data: unlisted, refresh: refreshUnlisted } = await useAsyncData(
  () => `my-unlisted-requests-${when.value}`,
  () => request<{ items: UnlistedRequest[] }>('/api/rooms/external-requests', { query: { when: when.value } }),
  { watch: [when], default: (): { items: UnlistedRequest[] } => ({ items: [] }) },
)

const cancellingUnlisted = ref<UnlistedRequest | null>(null)

// A room we do not manage is a different thing, so it says so rather than posing as a booking.
async function cancelUnlisted(): Promise<void> {
  const one = cancellingUnlisted.value
  if (!one) return

  working.value = true
  try {
    const answer = await $fetch<{ alreadyRequested: boolean }>(`/api/rooms/external-requests/${one.id}/cancel`, { method: 'POST' })
    toast.add({
      title: 'Withdrawn',
      description: answer.alreadyRequested
        ? 'The Theatre Manager has been told. Our booking for it still stands.'
        : 'Nothing had been requested.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    cancellingUnlisted.value = null
    await refreshUnlisted()
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    working.value = false
  }
}

const { data, status, error, refresh } = await useAsyncData(
  () => `my-bookings-${when.value}`,
  () => request<Listing>('/api/rooms/bookings', { query: { when: when.value } }),
  { watch: [when], default: (): Listing => ({ when: 'upcoming', items: [], total: 0 }) },
)

const listFailure = useListFailure(error, 'Your bookings could not be read.')

const STATES: Record<string, { label: string, color: 'success' | 'warning' | 'neutral' | 'error' }> = {
  CONFIRMED: { label: 'Confirmed', color: 'success' },
  PENDING_APPROVAL: { label: 'Waiting on a decision', color: 'warning' },
  CANCELLED: { label: 'Cancelled', color: 'neutral' },
  REJECTED: { label: 'Turned down', color: 'error' },
  BUMPED: { label: 'Given to a higher priority', color: 'neutral' },
}

// A moved booking is CANCELLED carrying a pointer, and reading it as "Cancelled" would tell the
// member the opposite of what happened (C-123 criterion 5).
const stateOf = (booking: { status: string, convertedToRequestId?: string | null }): { label: string, color: 'success' | 'warning' | 'neutral' | 'error' } => {
  const label = saysBookingState(booking)
  if (booking.status === 'CANCELLED' && booking.convertedToRequestId) return { label, color: 'warning' }
  return { label, color: STATES[booking.status]?.color ?? 'neutral' }
}

function spanOf(booking: Booking): string {
  const from = formatLondon(new Date(booking.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
  const to = formatLondon(new Date(booking.endsAt * 1000), { timeStyle: 'short' })
  return `${from} to ${to}`
}

// Which of the two, chosen explicitly. Nothing is preselected: a member cancelling one week must
// not lose a term to a button whose meaning they had to infer (C-111 criterion 1).
const scope = ref<'occurrence' | 'series' | undefined>()

watch(cancelling, (booking) => {
  scope.value = booking?.seriesId ? undefined : 'occurrence'
})

async function cancel(): Promise<void> {
  const booking = cancelling.value
  if (!booking || scope.value === undefined) return

  working.value = true
  try {
    const answer = await $fetch<{ cancelled: number }>(`/api/rooms/bookings/${booking.id}/cancel`, {
      method: 'POST',
      body: { scope: scope.value },
    })
    toast.add({
      title: answer.cancelled > 1 ? `${plural(answer.cancelled, 'booking')} cancelled` : 'Cancelled',
      description: 'The slot is free for somebody else.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    cancelling.value = null
    await refresh()
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    working.value = false
  }
}

// A request nobody has answered is still the member's to change; the server re-runs every check
// and is the authority on what the change means (C-108 criterion 4).
const editing = ref<Booking | null>(null)
const editScope = ref<'occurrence' | 'series' | undefined>()

const editFields = z.object({
  roomId: z.string().min(1, 'Choose a room'),
  title: z.string().trim().min(1, 'Say what the booking is for').max(200),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a day'),
  from: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a start time'),
  to: z.string().regex(/^\d{2}:\d{2}$/, 'Choose an end time'),
  attendees: z.number().int().positive().nullish(),
  purpose: z.string().min(1, 'Say what the room is for'),
  reason: z.string().trim().min(1, 'Say why this one is worth an exception').max(REQUEST_REASON_LIMIT),
}).refine(one => one.to > one.from, { path: ['to'], message: 'A booking ends after it starts' })

type EditFields = z.output<typeof editFields>

const draft = reactive<EditFields>({ roomId: '', title: '', day: '', from: '', to: '', attendees: undefined, purpose: '', reason: '' })

const { data: editRooms } = await useAsyncData(
  'my-bookings-rooms',
  async () => (await request<{ rooms: { id: string, name: string }[] }>('/api/rooms/availability', {
    query: { from: londonDay(new Date()), to: londonDay(new Date()) },
  })).rooms,
  { default: (): { id: string, name: string }[] => [] },
)

const { data: rules } = await useAsyncData(
  'room-policy',
  () => request<{ seriesCap: number, purposes: string[] }>('/api/rooms/policy'),
  { default: () => ({ seriesCap: 12, purposes: [] as string[] }) },
)

watch(editing, (booking) => {
  editScope.value = booking?.seriesId ? undefined : 'occurrence'
  if (!booking) return
  const start = new Date(booking.startsAt * 1000)
  Object.assign(draft, {
    roomId: booking.roomId,
    title: booking.title,
    day: londonDay(start),
    from: londonClock(start),
    to: londonClock(new Date(booking.endsAt * 1000)),
    attendees: booking.attendees ?? undefined,
    purpose: booking.purpose ?? '',
    reason: booking.reason ?? '',
  })
})

// The wall clock the member typed, turned into the instant it names in London (0014).
function instantOf(day: string, clock: string): string {
  const [year, month, date] = day.split('-').map(Number)
  const [hour, minute] = clock.split(':').map(Number)
  return fromLondonWallClock(year!, month!, date!, hour!, minute!).toISOString()
}

async function saveEdit(event: FormSubmitEvent<EditFields>): Promise<void> {
  const booking = editing.value
  if (!booking || editScope.value !== 'occurrence') return

  working.value = true
  try {
    const answer = await $fetch<{ restartedClock: boolean }>(`/api/rooms/bookings/${booking.id}`, {
      method: 'PUT',
      body: {
        roomId: event.data.roomId,
        title: event.data.title,
        startsAt: instantOf(event.data.day, event.data.from),
        endsAt: instantOf(event.data.day, event.data.to),
        attendees: event.data.attendees ?? null,
        tier: booking.tier,
        purpose: event.data.purpose,
        notes: booking.notes,
        reason: event.data.reason,
        scope: editScope.value,
      },
    })
    toast.add({
      title: 'Request changed',
      description: answer.restartedClock
        ? 'A new room or day is a new question, so it waits for a decision as if asked today.'
        : 'It still holds its slot while an officer decides.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    editing.value = null
    await refresh()
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    working.value = false
  }
}

useSeoMeta({ title: 'My bookings' })
</script>

<template>
  <UContainer
    :class="MEMBER_PAGE_READING"
    data-test="rooms-mine-page"
  >
    <UPageHeader
      title="My bookings"
      description="What you hold, and what became of what you held. Cancelling frees the slot straight away."
    />

    <UFieldGroup class="mt-6">
      <UButton
        :color="when === 'upcoming' ? 'primary' : 'neutral'"
        variant="outline"
        :aria-pressed="when === 'upcoming'"
        :icon="when === 'upcoming' ? 'i-lucide-check' : undefined"
        data-test="mine-upcoming"
        @click="when = 'upcoming'"
      >
        Coming up
      </UButton>
      <UButton
        :color="when === 'past' ? 'primary' : 'neutral'"
        variant="outline"
        :aria-pressed="when === 'past'"
        :icon="when === 'past' ? 'i-lucide-check' : undefined"
        data-test="mine-past"
        @click="when = 'past'"
      >
        Past
      </UButton>
    </UFieldGroup>

    <div
      v-if="status === 'pending'"
      class="mt-8 flex items-center gap-3 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="animate-spin"
      />
      <span>Reading your bookings.</span>
    </div>

    <ReadFailure
      v-else-if="listFailure"
      :failure="listFailure"
      class="mt-8"
      @retry="refresh()"
    />

    <p
      v-else-if="data.items.length === 0"
      class="mt-8 text-sm text-muted"
      data-test="mine-empty"
    >
      <template v-if="when === 'upcoming'">
        Nothing booked yet. <ULink to="/rooms">
          Find a free slot
        </ULink> and it appears here.
      </template>
      <template v-else>
        Nothing has finished. A booking moves here once its slot has passed.
      </template>
    </p>

    <ul
      v-else
      class="mt-8 divide-y divide-default"
      data-test="mine-list"
    >
      <li
        v-for="booking in data.items"
        :key="booking.id"
        class="flex flex-wrap items-start gap-3 py-4"
        :data-test="`booking-${booking.id}`"
      >
        <div class="min-w-0 flex-1">
          <p class="flex flex-wrap items-center gap-2 font-medium">
            {{ booking.room }}
            <UBadge
              :color="stateOf(booking).color"
              variant="subtle"
              size="sm"
            >
              {{ stateOf(booking).label }}
            </UBadge>
          </p>
          <p class="text-sm text-muted">
            {{ spanOf(booking) }}
          </p>
          <p class="text-sm">
            {{ booking.title }}
          </p>
          <p
            v-if="booking.seriesId"
            class="text-xs text-muted"
            :data-test="`series-of-${booking.id}`"
          >
            Week {{ booking.occurrence }} of {{ booking.seriesLength }} in a series
          </p>
          <p
            v-if="booking.rejectionReason"
            class="mt-1 text-sm text-error"
          >
            {{ booking.rejectionReason }}
          </p>
          <p
            v-if="booking.bumpedReason"
            class="mt-1 text-sm text-warning"
            :data-test="`bumped-${booking.id}`"
          >
            Given to something with a higher claim: {{ booking.bumpedReason }}.
            {{ booking.bumpedToBookingId ? 'A replacement is held for you below.' : '' }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            v-if="booking.status === 'CONFIRMED'"
            size="sm"
            color="neutral"
            variant="subtle"
            icon="i-lucide-calendar-plus"
            :to="`/api/rooms/bookings/${booking.id}/ics`"
            external
            download
            :aria-label="`Add ${booking.room} to my calendar`"
            :data-test="`ics-${booking.id}`"
          >
            Add to calendar
          </UButton>

          <UButton
            v-if="booking.editable"
            size="sm"
            color="neutral"
            variant="subtle"
            icon="i-lucide-pencil"
            :data-test="`edit-${booking.id}`"
            @click="editing = booking"
          >
            Change
          </UButton>

          <UButton
            v-if="booking.cancellable"
            size="sm"
            color="error"
            variant="subtle"
            :data-test="`cancel-${booking.id}`"
            @click="cancelling = booking"
          >
            Cancel
          </UButton>
        </div>
      </li>
    </ul>

    <p
      v-if="data.items.length"
      class="mt-6 text-sm text-muted"
    >
      {{ plural(data.total, 'booking') }}
    </p>

    <section
      v-if="unlisted.items.length"
      class="mt-10"
      data-test="unlisted-list"
    >
      <h2 class="text-lg font-semibold">
        Rooms we do not manage
      </h2>
      <p class="mt-1 text-sm text-muted">
        The Theatre Manager decides which room we get, and none of these is held until they answer.
      </p>

      <ul class="mt-4 divide-y divide-default">
        <li
          v-for="one in unlisted.items"
          :key="one.id"
          class="flex flex-wrap items-start gap-3 py-4"
          :data-test="`unlisted-${one.id}`"
        >
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2 font-medium">
              {{ one.assigned ?? one.preferred ?? 'A room not listed here' }}
              <UBadge
                :color="one.status === 'CONFIRMED' ? 'success' : one.status === 'AWAITING_EXTERNAL' ? 'info' : 'neutral'"
                variant="subtle"
                size="sm"
              >
                {{ saysExternalState(one) }}
              </UBadge>
            </p>
            <p class="text-sm text-muted">
              {{ formatLondon(new Date(one.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }) }}
              to {{ formatLondon(new Date(one.endsAt * 1000), { timeStyle: 'short' }) }}
            </p>
            <p class="text-sm">
              {{ one.title }}
            </p>
            <p
              v-if="one.rejectionReason"
              class="mt-1 text-sm text-error"
            >
              {{ one.rejectionReason }}
            </p>
          </div>

          <UButton
            v-if="one.cancellable"
            size="sm"
            color="error"
            variant="subtle"
            :data-test="`cancel-unlisted-${one.id}`"
            @click="cancellingUnlisted = one"
          >
            Withdraw
          </UButton>
        </li>
      </ul>
    </section>

    <UAlert
      v-if="standing.standing !== 'CLEAR'"
      class="mt-8"
      :color="standing.standing === 'PRE_APPROVAL' ? 'warning' : 'neutral'"
      variant="subtle"
      icon="i-lucide-user-x"
      :title="standing.standing === 'PRE_APPROVAL' ? 'Your bookings are checked before they are held' : 'Bookings you did not use'"
      :description="standing.says"
      data-test="standing"
    />

    <UPageCard
      class="mt-10"
      title="Your bookings in your own calendar"
      description="Subscribe once and every booking appears where the rest of your life is planned. The link is yours alone, so do not share it."
      data-test="feed-card"
    >
      <div class="space-y-3">
        <div
          v-if="feedUrl"
          class="space-y-2"
        >
          <UInput
            :model-value="feedUrl"
            readonly
            class="w-full font-mono text-xs"
            data-test="feed-url"
            @focus="(event: FocusEvent) => (event.target as HTMLInputElement).select()"
          />
          <p class="text-sm text-muted">
            Copy this now. It is shown once, and asking for another replaces it.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="feedUrl"
            color="neutral"
            variant="outline"
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            data-test="feed-copy"
            @click="copyFeed"
          >
            {{ copied ? 'Copied' : 'Copy the link' }}
          </UButton>

          <UButton
            :loading="minting"
            :color="feed.exists ? 'neutral' : 'primary'"
            :variant="feed.exists ? 'outline' : 'solid'"
            data-test="feed-mint"
            @click="mintFeed"
          >
            {{ feed.exists ? 'Replace my calendar link' : 'Create my calendar link' }}
          </UButton>
        </div>

        <p
          v-if="feed.exists && !feedUrl"
          class="text-sm text-muted"
          data-test="feed-exists"
        >
          You already have one. Replacing it makes a new link and stops the old one working
          straight away.
        </p>
      </div>
    </UPageCard>

    <UModal
      :open="cancellingUnlisted !== null"
      title="Withdraw this request?"
      description="This was arranged by hand, so withdrawing here tells the Theatre Manager to withdraw it with them."
      @update:open="cancellingUnlisted = null"
    >
      <template #body>
        <p class="text-sm">
          Nothing is freed automatically: our booking for it stands until a person cancels
          it with them.
        </p>
      </template>
      <template #footer>
        <UButton
          color="error"
          :loading="working"
          data-test="cancel-unlisted-confirm"
          @click="cancelUnlisted"
        >
          Withdraw the request
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="cancellingUnlisted = null"
        >
          Keep it
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="editing !== null"
      title="Change this request"
      :description="editing ? `${editing.room}, ${spanOf(editing)}` : ''"
      @update:open="editing = null"
    >
      <template #body>
        <UForm
          id="edit-request"
          :schema="editFields"
          :state="draft"
          class="space-y-4"
          data-test="edit-form"
          @submit="saveEdit"
        >
          <!-- Both named, neither chosen, as for cancelling (C-111 criterion 1). -->
          <URadioGroup
            v-if="editing?.seriesId"
            v-model="editScope"
            data-test="edit-scope"
            :items="[
              { label: 'Just this one', description: `Week ${editing.occurrence} of ${editing.seriesLength}. The rest stay as they are.`, value: 'occurrence' },
              { label: 'The whole series', description: 'Every date still waiting.', value: 'series' },
            ]"
          />

          <UAlert
            v-if="editScope === 'series'"
            color="warning"
            variant="subtle"
            icon="i-lucide-info"
            :description="SERIES_EDIT_REFUSAL"
            data-test="edit-series-refused"
          />

          <template v-if="editScope === 'occurrence'">
            <p class="text-sm text-muted">
              Moving it to another room or another day starts the wait for a decision again.
              Anything else leaves it where it is.
            </p>

            <UFormField
              label="Room"
              name="roomId"
              required
            >
              <USelect
                v-model="draft.roomId"
                :items="editRooms.map(one => ({ label: one.name, value: one.id }))"
                class="w-full"
                data-test="edit-room"
              />
            </UFormField>

            <UFormField
              label="What it is for"
              name="title"
              required
            >
              <UInput
                v-model="draft.title"
                class="w-full"
                data-test="edit-title"
              />
            </UFormField>

            <UFormField
              label="Day"
              name="day"
              required
            >
              <DateField
                v-model="draft.day"
                data-test="edit-day"
              />
            </UFormField>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                label="From"
                name="from"
                required
              >
                <TimeField
                  v-model="draft.from"
                  class="w-full"
                  data-test="edit-from"
                />
              </UFormField>

              <UFormField
                label="Until"
                name="to"
                required
              >
                <TimeField
                  v-model="draft.to"
                  class="w-full"
                  data-test="edit-to"
                />
              </UFormField>
            </div>

            <UFormField
              label="How many people"
              name="attendees"
              hint="Optional"
            >
              <UInputNumber
                v-model="draft.attendees"
                :min="1"
                class="w-full"
                data-test="edit-attendees"
              />
            </UFormField>

            <UFormField
              label="What the room is for"
              name="purpose"
              required
            >
              <USelect
                v-model="draft.purpose"
                :items="rules.purposes.map(purpose => ({ label: describePurpose(purpose), value: purpose }))"
                value-key="value"
                class="w-full"
                data-test="edit-purpose"
              />
            </UFormField>

            <UFormField
              label="Why this one is worth an exception"
              name="reason"
              required
              :description="`Shown to whoever decides. Up to ${REQUEST_REASON_LIMIT} characters.`"
            >
              <UTextarea
                v-model="draft.reason"
                :maxlength="REQUEST_REASON_LIMIT"
                :rows="3"
                class="w-full"
                data-test="edit-reason"
              />
            </UFormField>
          </template>
        </UForm>
      </template>

      <template #footer>
        <div class="flex flex-wrap gap-2">
          <UButton
            type="submit"
            form="edit-request"
            :loading="working"
            :disabled="editScope !== 'occurrence'"
            data-test="edit-confirm"
          >
            Save the change
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            @click="editing = null"
          >
            Leave it as it is
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Asked before doing it: the slot goes to whoever wants it next, and there is no undo. -->
    <UModal
      :open="cancelling !== null"
      title="Cancel this booking?"
      :description="cancelling ? `${cancelling.room}, ${spanOf(cancelling)}` : ''"
      @update:open="cancelling = null"
    >
      <template #body>
        <p class="text-sm">
          The slot frees straight away and somebody else may take it. Cancelling cannot be undone;
          you would have to book again.
        </p>

        <!-- Both named, neither chosen: the button stays disabled until the member says which. -->
        <URadioGroup
          v-if="cancelling?.seriesId"
          v-model="scope"
          class="mt-4"
          data-test="cancel-scope"
          :items="[
            { label: 'Just this one', description: `Week ${cancelling.occurrence} of ${cancelling.seriesLength}. The rest stand.`, value: 'occurrence' },
            { label: 'The whole series', description: 'Every date still standing. Ones already cancelled or turned down are left alone.', value: 'series' },
          ]"
        />
      </template>

      <template #footer>
        <div class="flex flex-wrap gap-2">
          <UButton
            color="error"
            :loading="working"
            :disabled="scope === undefined"
            data-test="cancel-confirm"
            @click="cancel"
          >
            {{ scope === 'series' ? 'Cancel the whole series' : 'Cancel the booking' }}
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            @click="cancelling = null"
          >
            Keep it
          </UButton>
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
