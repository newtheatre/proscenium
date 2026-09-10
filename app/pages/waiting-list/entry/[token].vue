<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import { saysPrice } from '#shared/utils/ticket-types'

// Where a waiting-list link opens: WAITING says so, OFFERED lets it be claimed (D-113 criteria
// 2, 4), and CLAIMED, LAPSED and REMOVED are terminal states with nothing left to do here.

interface TicketType { id: string, name: string, description: string | null, price: number }

interface Entry {
  status: 'WAITING' | 'OFFERED' | 'CLAIMED' | 'LAPSED' | 'REMOVED'
  showTitle: string
  startsAt: number
  partySize: number
  offerExpiresAt: number | null
  ticketTypes: TicketType[]
}

interface Confirmation {
  reference: string
  totalPence: number
  qrToken: string
}

const route = useRoute()
const token = computed(() => String(route.params.token))

const { data, refresh } = await useFetch<Entry>(() => `/api/waiting-list/${token.value}`)

if (!data.value) {
  throw createError({ statusCode: 404, statusMessage: 'No such waiting-list entry', fatal: true })
}

const quantities = reactive<Record<string, number>>({})
watchEffect(() => {
  for (const type of data.value?.ticketTypes ?? []) {
    if (!(type.id in quantities)) quantities[type.id] = 0
  }
})

const lines = computed(() => Object.entries(quantities)
  .filter(([, quantity]) => quantity > 0)
  .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })))

const requested = computed(() => lines.value.reduce((total, line) => total + line.quantity, 0))

const submitting = ref(false)
const removing = ref(false)
const notice = ref<string | null>(null)
const confirmation = ref<Confirmation | null>(null)
const removed = ref(false)

async function claim(): Promise<void> {
  notice.value = null
  submitting.value = true
  try {
    confirmation.value = await $fetch<Confirmation>(`/api/waiting-list/${token.value}/claim`, {
      method: 'POST',
      body: { lines: lines.value },
    })
  }
  catch (error) {
    notice.value = refusalText(error, 'This offer could not be claimed')
    await refresh()
  }
  finally {
    submitting.value = false
  }
}

async function leave(): Promise<void> {
  removing.value = true
  try {
    await $fetch(`/api/waiting-list/${token.value}/remove`, { method: 'POST' })
    removed.value = true
  }
  finally {
    removing.value = false
  }
}

useSeoMeta({ title: 'Your waiting-list entry' })
</script>

<template>
  <UContainer
    class="max-w-2xl py-16"
    data-test="waiting-list-entry-page"
  >
    <h1 class="nnt-headline text-3xl">
      {{ data!.showTitle }}
    </h1>
    <p class="text-muted">
      {{ formatLondon(new Date(data!.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }) }}
    </p>

    <div
      v-if="confirmation"
      class="mt-8 space-y-3"
      data-test="waiting-list-claimed"
    >
      <UAlert
        color="success"
        variant="subtle"
        icon="i-lucide-ticket"
        title="Seats claimed"
        :description="`Reference ${confirmation.reference}. Pay ${saysPrice(confirmation.totalPence)} at the box office on the night; this reservation is unpaid until then.`"
      />
      <UButton :to="`/qr/${confirmation.qrToken}`">
        View your booking
      </UButton>
    </div>

    <div
      v-else-if="removed"
      class="mt-8"
      data-test="waiting-list-removed"
    >
      <UAlert
        color="neutral"
        variant="subtle"
        description="You have left the waiting list."
      />
    </div>

    <div
      v-else-if="data!.status === 'OFFERED' && data!.offerExpiresAt"
      class="mt-8 space-y-6"
      data-test="waiting-list-offered"
    >
      <UAlert
        color="info"
        variant="subtle"
        icon="i-lucide-clock"
        title="A seat is free"
        :description="`Held for you until ${formatLondon(new Date(data!.offerExpiresAt * 1000), { dateStyle: 'full', timeStyle: 'short' })}. Choose ${data!.partySize === 1 ? '1 ticket' : `${data!.partySize} tickets`} to claim it.`"
      />

      <UAlert
        v-if="notice"
        color="error"
        variant="subtle"
        :description="notice"
        data-test="waiting-list-claim-notice"
      />

      <UCard>
        <ul class="divide-y divide-default">
          <li
            v-for="type in data!.ticketTypes"
            :key="type.id"
            class="flex items-center justify-between gap-4 py-3"
            :data-test="`ticket-type-${type.id}`"
          >
            <div>
              <p class="font-medium">
                {{ type.name }}
              </p>
              <p class="text-sm text-muted">
                {{ saysPrice(type.price) }}
              </p>
            </div>
            <UInputNumber
              v-model="quantities[type.id]"
              :min="0"
              :max="data!.partySize"
              class="w-28"
              :data-test="`quantity-${type.id}`"
            />
          </li>
        </ul>
      </UCard>

      <div class="flex items-center justify-between">
        <p class="text-sm text-muted">
          {{ requested }} of {{ data!.partySize }} chosen
        </p>
        <UButton
          :loading="submitting"
          :disabled="requested !== data!.partySize"
          data-test="waiting-list-claim-submit"
          @click="claim"
        >
          Claim these seats
        </UButton>
      </div>

      <UButton
        variant="link"
        color="neutral"
        :loading="removing"
        data-test="waiting-list-leave"
        @click="leave"
      >
        Leave the waiting list instead
      </UButton>
    </div>

    <div
      v-else-if="data!.status === 'WAITING'"
      class="mt-8 space-y-4"
      data-test="waiting-list-waiting"
    >
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-clock"
        title="Still on the list"
        description="We'll email you the moment a seat frees up."
      />
      <UButton
        variant="link"
        color="neutral"
        :loading="removing"
        data-test="waiting-list-leave"
        @click="leave"
      >
        Leave the waiting list
      </UButton>
    </div>

    <div
      v-else
      class="mt-8"
      data-test="waiting-list-settled"
    >
      <UAlert
        color="neutral"
        variant="subtle"
        :description="data!.status === 'LAPSED'
          ? 'This offer lapsed and passed to the next person on the list. Contact the box office if you still want to attend.'
          : data!.status === 'CLAIMED'
            ? 'These seats have already been claimed.'
            : 'You already left this waiting list.'"
      />
    </div>
  </UContainer>
</template>
