<script setup lang="ts">
import { overCapReason } from '#shared/utils/reservations'
import { saysPrice } from '#shared/utils/ticket-types'

// The reservation flow (D-104): a guest or a signed-in account holds seats online; the box
// office takes payment in person, on the night. Nothing here ever moves money (0005).

interface BookableTicketType {
  id: string
  name: string
  description: string | null
  price: number
  accessKind: 'ACCESS' | 'COMPANION' | null
}

interface AccessEntitlement {
  access: number
  companion: number
}

interface RedeemablePass {
  id: string
  reference: string
  passTypeName: string
}

interface BookingInfo {
  performanceId: string
  showId: string
  refusal: { reason: string, says: string, closedAt?: number, externalBookingUrl?: string } | null
  cap: number
  ticketTypes: BookableTicketType[]
  accessEntitlement: AccessEntitlement | null
  redeemablePass: RedeemablePass | null
}

interface Confirmation {
  reference: string
  totalPence: number
  qrToken: string
}

const route = useRoute()
const performanceId = computed(() => String(route.params.performanceId))

const { data } = await useFetch<BookingInfo>(() => `/api/performances/${performanceId.value}/booking`)

if (!data.value) {
  throw createError({ statusCode: 404, statusMessage: 'No such performance', fatal: true })
}

const { account } = useAccount()

const quantities = reactive<Record<string, number>>(
  Object.fromEntries(data.value.ticketTypes.map(type => [type.id, 0])),
)

const lines = computed(() => Object.entries(quantities)
  .filter(([, quantity]) => quantity > 0)
  .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })))

const capReason = computed(() => (data.value ? overCapReason(lines.value, data.value.cap) : null))

// An access or companion row's own remaining entitlement, never the general order cap: the
// whole point is a limit of one and a limit of the verified number (D-128 criteria 1, 2).
function maxFor(type: BookableTicketType): number {
  const entitlement = data.value?.accessEntitlement
  if (type.accessKind === 'ACCESS' && entitlement) return Math.min(data.value!.cap, entitlement.access)
  if (type.accessKind === 'COMPANION' && entitlement) return Math.min(data.value!.cap, entitlement.companion)
  return data.value!.cap
}

const totalPence = computed(() => lines.value.reduce((total, line) => {
  const type = data.value?.ticketTypes.find(one => one.id === line.ticketTypeId)
  return total + (type ? type.price * line.quantity : 0)
}, 0))

const guestName = ref('')
const guestEmail = ref('')

const submitting = ref(false)
const notice = ref<string | null>(null)
const externalUrl = ref<string | null>(null)
const confirmation = ref<Confirmation | null>(null)

async function book(): Promise<void> {
  notice.value = null
  externalUrl.value = null

  if (lines.value.length === 0) {
    notice.value = 'Choose at least one ticket'
    return
  }
  if (!account.value.signedIn && (!guestName.value.trim() || !guestEmail.value.trim())) {
    notice.value = 'A name and an email address are required to book as a guest'
    return
  }

  submitting.value = true
  try {
    const body: { performanceId: string, lines: typeof lines.value, guest?: { name: string, email: string } } = {
      performanceId: performanceId.value,
      lines: lines.value,
    }
    if (!account.value.signedIn) body.guest = { name: guestName.value.trim(), email: guestEmail.value.trim() }

    const result = await $fetch<Confirmation>('/api/reservations', { method: 'POST', body })
    confirmation.value = result
  }
  catch (error) {
    notice.value = refusalText(error)
    externalUrl.value = refusalData<{ externalBookingUrl?: string }>(error)?.externalBookingUrl ?? null
  }
  finally {
    submitting.value = false
  }
}

// D-125: redeeming a pass is a separate, zero-value action from choosing paid ticket lines above,
// never a quantity in `lines` (a pass admits, it is not a ticket type on sale, criterion 1).
const redeeming = ref(false)
const redeemNotice = ref<string | null>(null)
const redemption = ref<Confirmation | null>(null)

async function redeemPass(): Promise<void> {
  if (!data.value?.redeemablePass) return
  redeemNotice.value = null
  redeeming.value = true
  try {
    const result = await $fetch<Confirmation>(`/api/passes/${data.value.redeemablePass.id}/redeem`, {
      method: 'POST',
      body: { performanceId: performanceId.value },
    })
    redemption.value = result
  }
  catch (error) {
    redeemNotice.value = refusalText(error)
  }
  finally {
    redeeming.value = false
  }
}

useSeoMeta({ title: 'Book tickets' })
</script>

<template>
  <UContainer
    class="max-w-2xl py-16"
    data-test="book-page"
  >
    <h1 class="nnt-headline text-3xl">
      Book tickets
    </h1>

    <div
      v-if="confirmation"
      class="mt-8 space-y-3"
      data-test="booking-confirmed"
    >
      <UAlert
        color="success"
        variant="subtle"
        icon="i-lucide-ticket"
        title="Reservation held"
        :description="`Reference ${confirmation.reference}. Pay ${saysPrice(confirmation.totalPence)} at the box office on the night; this reservation is unpaid until then.`"
      />
      <div class="flex flex-wrap gap-2">
        <UButton
          :to="`/qr/${confirmation.qrToken}`"
          data-test="view-booking"
        >
          View your booking
        </UButton>
        <UButton
          to="/whats-on"
          variant="link"
        >
          Back to what's on
        </UButton>
      </div>
    </div>

    <div
      v-else-if="redemption"
      class="mt-8 space-y-3"
      data-test="pass-redeemed"
    >
      <UAlert
        color="success"
        variant="subtle"
        icon="i-lucide-ticket"
        title="Pass redeemed"
        :description="`Reference ${redemption.reference}. Your pass admits you to this performance; nothing further is due.`"
      />
      <div class="flex flex-wrap gap-2">
        <UButton
          :to="`/qr/${redemption.qrToken}`"
          data-test="view-redemption"
        >
          View your booking
        </UButton>
        <UButton
          to="/whats-on"
          variant="link"
        >
          Back to what's on
        </UButton>
      </div>
    </div>

    <div v-else-if="data!.refusal">
      <UAlert
        class="mt-8"
        color="neutral"
        variant="subtle"
        icon="i-lucide-ticket-x"
        :title="'Booking is not open'"
        :description="data!.refusal.says"
        data-test="booking-refused"
      />
      <UButton
        v-if="data!.refusal.externalBookingUrl"
        class="mt-4"
        :to="data!.refusal.externalBookingUrl"
        target="_blank"
        rel="noopener"
        trailing-icon="i-lucide-external-link"
      >
        Book elsewhere
      </UButton>
    </div>

    <div
      v-else
      class="mt-8 space-y-6"
    >
      <UAlert
        v-if="notice"
        color="error"
        variant="subtle"
        :description="notice"
        data-test="booking-notice"
      />
      <UButton
        v-if="externalUrl"
        :to="externalUrl"
        target="_blank"
        rel="noopener"
        trailing-icon="i-lucide-external-link"
      >
        Book elsewhere
      </UButton>

      <UAlert
        v-if="data!.accessEntitlement"
        color="info"
        variant="subtle"
        icon="i-lucide-accessibility"
        :description="`Your access entitlement: ${data!.accessEntitlement.access} access ticket and up to ${data!.accessEntitlement.companion} companion ticket(s) still available for this performance.`"
        data-test="access-entitlement"
      />

      <UCard
        v-if="data!.redeemablePass"
        data-test="redeemable-pass"
      >
        <template #header>
          <h2 class="font-semibold">
            Your pass
          </h2>
        </template>
        <div class="flex items-center justify-between gap-4">
          <p class="text-sm text-muted">
            {{ data!.redeemablePass.passTypeName }} ({{ data!.redeemablePass.reference }}) covers this performance.
          </p>
          <UButton
            :loading="redeeming"
            data-test="redeem-pass"
            @click="redeemPass"
          >
            Use my pass
          </UButton>
        </div>
        <UAlert
          v-if="redeemNotice"
          class="mt-3"
          color="error"
          variant="subtle"
          :description="redeemNotice"
          data-test="redeem-notice"
        />
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Tickets
          </h2>
        </template>

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
                <UBadge
                  v-if="type.accessKind"
                  size="sm"
                  variant="subtle"
                  color="info"
                >
                  {{ type.accessKind === 'ACCESS' ? 'Access' : 'Companion' }}
                </UBadge>
              </p>
              <p
                v-if="type.description"
                class="text-sm text-muted"
              >
                {{ type.description }}
              </p>
              <p class="text-sm text-muted">
                {{ saysPrice(type.price) }}
              </p>
            </div>
            <UInputNumber
              v-model="quantities[type.id]"
              :min="0"
              :max="maxFor(type)"
              class="w-28"
              :data-test="`quantity-${type.id}`"
            />
          </li>
        </ul>

        <p
          v-if="data!.ticketTypes.length === 0"
          class="text-muted"
        >
          Nothing is on sale for this performance yet.
        </p>
      </UCard>

      <UAlert
        v-if="capReason"
        color="warning"
        variant="subtle"
        :description="capReason"
        data-test="booking-over-cap"
      />

      <UCard v-if="!account.signedIn">
        <template #header>
          <h2 class="font-semibold">
            Your details
          </h2>
        </template>
        <div class="space-y-4">
          <UFormField
            label="Name"
            required
          >
            <UInput
              v-model="guestName"
              class="w-full"
              autocomplete="name"
              data-test="guest-name"
            />
          </UFormField>
          <UFormField
            label="Email address"
            required
            description="Your reference and the amount due are sent here."
          >
            <UInput
              v-model="guestEmail"
              type="email"
              class="w-full"
              autocomplete="email"
              data-test="guest-email"
            />
          </UFormField>
        </div>
      </UCard>

      <div class="flex items-center justify-between">
        <p
          class="text-lg font-medium"
          data-test="booking-total"
        >
          Total due at the desk: {{ saysPrice(totalPence) }}
        </p>
        <UButton
          :loading="submitting"
          :disabled="lines.length === 0 || capReason !== null"
          data-test="booking-submit"
          @click="book"
        >
          Hold these seats
        </UButton>
      </div>
    </div>
  </UContainer>
</template>
