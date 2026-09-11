<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
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
  show: { slug: string, title: string }
  performance: { startsAt: number, venueName: string }
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

const typeFor = (id: string): BookableTicketType | undefined => data.value?.ticketTypes.find(one => one.id === id)

// What the stub reads back: the same lines the request carries, priced in pence to the last step.
const ordered = computed(() => lines.value.flatMap((line) => {
  const type = typeFor(line.ticketTypeId)
  return type ? [{ id: type.id, name: type.name, quantity: line.quantity, pence: type.price * line.quantity }] : []
}))

const totalPence = computed(() => ordered.value.reduce((total, line) => total + line.pence, 0))
const seats = computed(() => ordered.value.reduce((total, line) => total + line.quantity, 0))

const when = computed(() => (data.value
  ? formatLondon(new Date(data.value.performance.startsAt * 1000), {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    })
  : ''))

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

useSeoMeta({
  title: 'Book tickets',
  description: () => `Hold seats for ${data.value?.show.title ?? 'a show'} at the Nottingham New Theatre. Payment is taken at the theatre, in person.`,
})
</script>

<template>
  <UContainer
    class="max-w-5xl py-12"
    data-test="book-page"
  >
    <UPageHeader
      :title="`Book: ${data!.show.title}`"
      :description="`${when} · ${data!.performance.venueName}`"
      :ui="{ title: 'nnt-headline' }"
      :links="[{ label: 'About the show', to: `/shows/${data!.show.slug}`, variant: 'link', color: 'primary' }]"
    />

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
        title="Booking is not open"
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
      class="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]"
    >
      <div class="space-y-8">
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
          <div class="flex flex-wrap items-center justify-between gap-4">
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

        <section>
          <h2 class="nnt-headline text-xl">
            1 · Tickets
          </h2>

          <ul class="mt-4 divide-y divide-default">
            <li
              v-for="type in data!.ticketTypes"
              :key="type.id"
              class="flex flex-wrap items-center justify-between gap-4 py-4"
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
              </div>
              <div class="flex items-center gap-4">
                <span class="font-mono">{{ saysPrice(type.price) }}</span>
                <UInputNumber
                  v-model="quantities[type.id]"
                  :min="0"
                  :max="maxFor(type)"
                  class="w-28"
                  :data-test="`quantity-${type.id}`"
                />
              </div>
            </li>
          </ul>

          <p
            v-if="data!.ticketTypes.length === 0"
            class="mt-4 text-muted"
          >
            Nothing is on sale for this performance yet.
          </p>
        </section>

        <section v-if="!account.signedIn">
          <h2 class="nnt-headline text-xl">
            2 · Your details
          </h2>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
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
        </section>
      </div>

      <!-- The order as a ticket stub, and the view's one marquee at the foot of it. Below lg it
           follows the form, which is the order a phone reads in. -->
      <UCard
        variant="ticket"
        class="self-start lg:sticky lg:top-24"
        data-test="booking-summary"
      >
        <template #header>
          <h2 class="font-semibold">
            Your order
          </h2>
          <p class="text-sm text-muted">
            {{ data!.show.title }}
          </p>
        </template>

        <ul
          v-if="ordered.length"
          class="space-y-2"
        >
          <li
            v-for="line in ordered"
            :key="line.id"
            class="flex items-baseline justify-between gap-4 font-mono text-sm"
            :data-test="`order-line-${line.id}`"
          >
            <span>{{ line.name }} × {{ line.quantity }}</span>
            <span>{{ saysPrice(line.pence) }}</span>
          </li>
        </ul>
        <p
          v-else
          class="text-sm text-muted"
        >
          Nothing chosen yet.
        </p>

        <div class="mt-4 flex items-baseline justify-between gap-4">
          <span class="font-medium">To pay at the theatre</span>
          <span
            class="font-mono text-lg"
            data-test="booking-total"
          >{{ saysPrice(totalPence) }}</span>
        </div>
        <p class="mt-1 text-sm text-muted">
          Nothing is paid online, ever. Settle up at the box office when you arrive.
        </p>

        <template #footer>
          <UAlert
            v-if="notice"
            class="mb-3"
            color="error"
            variant="subtle"
            :description="notice"
            data-test="booking-notice"
          />
          <UAlert
            v-if="capReason"
            class="mb-3"
            color="warning"
            variant="subtle"
            :description="capReason"
            data-test="booking-over-cap"
          />
          <UButton
            variant="marquee"
            size="lg"
            block
            :loading="submitting"
            :disabled="lines.length === 0 || capReason !== null"
            data-test="booking-submit"
            @click="book"
          >
            {{ seats === 0 ? 'Reserve your seats' : `Reserve ${seats} ${seats === 1 ? 'ticket' : 'tickets'}` }}
          </UButton>
          <UButton
            v-if="externalUrl"
            class="mt-3"
            :to="externalUrl"
            target="_blank"
            rel="noopener"
            trailing-icon="i-lucide-external-link"
            block
          >
            Book elsewhere
          </UButton>
          <p class="mt-3 text-sm text-muted">
            A reservation holds your seats until shortly before curtain, then they go back on sale.
          </p>
        </template>
      </UCard>
    </div>
  </UContainer>
</template>
