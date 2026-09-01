<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import { saysExternalStatus } from '#shared/utils/external-requests'

definePageMeta({ middleware: 'signed-in' })

interface Booking {
  id: string
  room: string
  title: string
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

interface UnionRequest {
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

const { data: union, refresh: refreshUnion } = await useAsyncData(
  () => `my-union-requests-${when.value}`,
  () => request<{ items: UnionRequest[] }>('/api/rooms/external-requests', { query: { when: when.value } }),
  { watch: [when], default: (): { items: UnionRequest[] } => ({ items: [] }) },
)

const cancellingUnion = ref<UnionRequest | null>(null)

// A union room is a different kind of thing, so it says so rather than pretending to be a booking.
async function cancelUnion(): Promise<void> {
  const one = cancellingUnion.value
  if (!one) return

  working.value = true
  try {
    const answer = await $fetch<{ unionTold: boolean }>(`/api/rooms/external-requests/${one.id}/cancel`, { method: 'POST' })
    toast.add({
      title: 'Withdrawn',
      description: answer.unionTold
        ? 'The Theatre Manager has been told, because the union still has our booking.'
        : 'It had not gone to the union yet.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    cancellingUnion.value = null
    await refreshUnion()
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    working.value = false
  }
}

const { data, status, refresh } = await useAsyncData(
  () => `my-bookings-${when.value}`,
  () => request<Listing>('/api/rooms/bookings', { query: { when: when.value } }),
  { watch: [when], default: (): Listing => ({ when: 'upcoming', items: [], total: 0 }) },
)

const STATES: Record<string, { label: string, color: 'success' | 'warning' | 'neutral' | 'error' }> = {
  CONFIRMED: { label: 'Confirmed', color: 'success' },
  PENDING_APPROVAL: { label: 'Waiting on a decision', color: 'warning' },
  CANCELLED: { label: 'Cancelled', color: 'neutral' },
  REJECTED: { label: 'Turned down', color: 'error' },
  BUMPED: { label: 'Given to a higher priority', color: 'neutral' },
}

// An unregistered status shows as itself rather than falling out of the list (0027's habit).
const stateOf = (status: string): { label: string, color: 'success' | 'warning' | 'neutral' | 'error' } =>
  STATES[status] ?? { label: status, color: 'neutral' }

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

useSeoMeta({ title: 'My bookings' })
</script>

<template>
  <UContainer class="max-w-3xl py-16">
    <UPageHeader
      title="My bookings"
      description="What you hold, and what became of what you held. Cancelling frees the slot straight away."
    />

    <UFieldGroup class="mt-6">
      <UButton
        :color="when === 'upcoming' ? 'primary' : 'neutral'"
        variant="outline"
        data-test="mine-upcoming"
        @click="when = 'upcoming'"
      >
        Coming up
      </UButton>
      <UButton
        :color="when === 'past' ? 'primary' : 'neutral'"
        variant="outline"
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
        Nothing in the past yet.
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
              :color="stateOf(booking.status).color"
              variant="subtle"
              size="sm"
            >
              {{ stateOf(booking.status).label }}
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
      v-if="union.items.length"
      class="mt-10"
      data-test="union-list"
    >
      <h2 class="nnt-headline text-lg">
        Rooms asked for through the union
      </h2>
      <p class="mt-1 text-sm text-muted">
        The union decides which room we get, so none of these is held until they answer.
      </p>

      <ul class="mt-4 divide-y divide-default">
        <li
          v-for="one in union.items"
          :key="one.id"
          class="flex flex-wrap items-start gap-3 py-4"
          :data-test="`union-${one.id}`"
        >
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2 font-medium">
              {{ one.assigned ?? one.preferred ?? 'A union room' }}
              <UBadge
                :color="one.status === 'CONFIRMED' ? 'success' : one.status === 'AWAITING_EXTERNAL' ? 'info' : 'neutral'"
                variant="subtle"
                size="sm"
              >
                {{ saysExternalStatus(one.status) }}
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
            :data-test="`cancel-union-${one.id}`"
            @click="cancellingUnion = one"
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
      :open="cancellingUnion !== null"
      title="Withdraw this request?"
      description="The union arranged this by hand, so withdrawing here tells the Theatre Manager to withdraw it with them."
      @update:open="cancellingUnion = null"
    >
      <template #body>
        <p class="text-sm">
          Nothing is freed automatically: our booking with the union stands until a person cancels
          it with them.
        </p>
      </template>
      <template #footer>
        <UButton
          color="error"
          :loading="working"
          data-test="cancel-union-confirm"
          @click="cancelUnion"
        >
          Withdraw it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="cancellingUnion = null"
        >
          Keep it
        </UButton>
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
