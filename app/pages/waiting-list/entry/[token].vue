<script setup lang="ts">
import { saysNoSuch } from '#shared/utils/no-such'
import { saysWhenLong } from '#shared/utils/when'
import { SAYS_PAYMENT } from '#shared/utils/programme'
import { saysPrice } from '#shared/utils/ticket-types'
import { partySizeMismatchReason } from '#shared/utils/waiting-list'

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
  throw createError({ statusCode: 404, statusMessage: saysNoSuch('waiting list entry', 'Ask for a new link from the email we sent you'), fatal: true })
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

// Criterion 2 commits the claim to the whole party, so the screen says the rule rather than
// leaving a disabled button to imply it.
const mismatch = computed(() => partySizeMismatchReason(requested.value, data.value?.partySize ?? 0))

const submitting = ref(false)
const leaving = ref(false)
const removing = ref(false)
const notice = ref<string | null>(null)
const confirmation = ref<Confirmation | null>(null)
const removed = ref(false)

async function claim(): Promise<void> {
  notice.value = null
  if (mismatch.value) {
    notice.value = mismatch.value
    return
  }
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

const leaveFailure = ref<string | null>(null)

async function leave(): Promise<void> {
  leaveFailure.value = null
  removing.value = true
  try {
    await $fetch(`/api/waiting-list/${token.value}/remove`, { method: 'POST' })
    leaving.value = false
    removed.value = true
  }
  catch {
    // The route refuses a forged, rotated or purged token alike, and cannot tell them apart:
    // one sentence covers all three without guessing which happened.
    leaveFailure.value = 'That link has already been used or is no longer valid.'
  }
  finally {
    removing.value = false
  }
}

// An offer standing right now costs the next person their turn; a plain place on the list does
// not, so the consequence says which it is (D-113 criteria 3 and 6).
const leaveConsequence = computed(() => (data.value?.status === 'OFFERED'
  ? 'The seat held for you goes to the next person on the list, and this link stops working.'
  : 'Your place on the list goes, and we stop emailing you about this performance.'))

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
      {{ saysWhenLong(data!.startsAt) }}
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
        :description="`Reference ${confirmation.reference}. ${SAYS_PAYMENT} ${saysPrice(confirmation.totalPence)} is due.`"
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
        :description="`Held for you until ${saysWhenLong(data!.offerExpiresAt)}.`"
      />

      <p
        class="text-sm text-muted"
        data-test="waiting-list-claim-rule"
      >
        An offer covers the whole party, so choose
        {{ data!.partySize === 1 ? '1 ticket' : `all ${data!.partySize} tickets` }} to claim it.
        Give seats back afterwards from your booking, or leave the list below.
      </p>

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
          data-test="waiting-list-claim-submit"
          @click="claim"
        >
          Claim these seats
        </UButton>
      </div>

      <UButton
        variant="link"
        color="neutral"
        data-test="waiting-list-leave"
        @click="leaving = true"
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
        description="We will email you the moment a seat frees up."
      />
      <UButton
        variant="link"
        color="neutral"
        data-test="waiting-list-leave"
        @click="leaving = true"
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

    <ConfirmModal
      v-model:open="leaving"
      name="leave-waiting-list"
      title="Leave the waiting list"
      verb="Leave the waiting list"
      :consequence="leaveConsequence"
      :loading="removing"
      :failure="leaveFailure"
      @confirm="leave"
    />
  </UContainer>
</template>
