<script setup lang="ts">
import { saysWhen, saysWhenLong } from '#shared/utils/when'
import { saysNightLine } from '#shared/utils/programme'
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
  refusal: { reason: string, says: string, closedAt?: number, externalBookingUrl?: string, waitingListUrl?: string } | null
  cap: number
  holdReleaseMinutes: number
  ticketTypes: BookableTicketType[]
  accessEntitlement: AccessEntitlement | null
  redeemablePass: RedeemablePass | null
}

interface Confirmation {
  reference: string
  totalPence: number
  qrToken: string
}

interface RunPerformance {
  id: string
  startsAt: number
  venueName: string
  availability: 'AVAILABLE' | 'LIMITED' | 'SOLD_OUT' | 'BOOKING_CLOSED'
  remaining: number | null
  says: string
  cancelled: boolean
  externalBookingUrl: string | null
  prices: { name: string, price: number, restrictedTo: string | null }[]
}

const route = useRoute()
const performanceId = computed(() => String(route.params.performanceId))

const { data } = await useFetch<BookingInfo>(() => `/api/performances/${performanceId.value}/booking`)

if (!data.value) {
  throw createError({ statusCode: 404, statusMessage: 'No such performance', fatal: true })
}

const { account } = useAccount()

// The run's other nights, from the public listing the show page already reads: picking one is a
// navigation, so the chosen night is always in the address (booking.png).
const { data: run } = await useFetch<{ performances: RunPerformance[] }>(() => `/api/shows/${data.value?.show.slug ?? ''}`)

const nights = computed(() => (run.value?.performances ?? []).filter(one => !one.cancelled && !one.externalBookingUrl))

// The venue is only worth a line where the run moves between them; otherwise the header has
// already said it once (D-104 criterion 8).
const acrossVenues = computed(() => new Set(nights.value.map(one => one.venueName)).size > 1)

// A member price the server has not offered this caller, because they are signed out: the listing
// prices the whole run publicly, so the page can say it exists without ever quoting it (D-109).
const memberPrice = computed(() => {
  if (account.value.signedIn) return false
  const tonight = (run.value?.performances ?? []).find(one => one.id === performanceId.value)
  return (tonight?.prices ?? []).some(price => price.restrictedTo === 'MEMBER')
})

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

const when = computed(() => (data.value ? saysWhenLong(data.value.performance.startsAt) : ''))

const nightWhen = (at: number): string => saysWhen(at)

const guestName = ref('')
const guestEmail = ref('')

// Where the confirmation went, kept from the request rather than read back, so the screen names
// the same address the email was addressed to (D-108 criterion 2).
const sentTo = ref<string | null>(null)

const submitting = ref(false)
const notice = ref<string | null>(null)
const externalUrl = ref<string | null>(null)
const confirmation = ref<Confirmation | null>(null)

// The reserve button owns both refusals, so a reader who lands on it hears why it will not do
// what it says rather than finding the sentence in a card footer they never reach (K-101).
const describedBy = computed(() => [
  notice.value ? 'booking-refusal' : null,
  capReason.value ? 'booking-cap' : null,
].filter(Boolean).join(' ') || undefined)

// Field-level, in the house's words: the server's own "Invalid request: guest.email" never
// reaches a reader, and neither does a Zod default (K-128, docs/copy-style.md).
const fieldErrors = reactive<{ name: string | null, email: string | null }>({ name: null, email: null })

function checkDetails(): boolean {
  fieldErrors.name = guestName.value.trim() ? null : 'Tell us the name the booking is under.'
  fieldErrors.email = !guestEmail.value.trim()
    ? 'Tell us where to send your booking reference.'
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.value.trim())
      ? null
      : 'That does not look like an email address. Check it and try again.'
  return fieldErrors.name === null && fieldErrors.email === null
}

// The route answers 400 with the field paths it rejected, so the refusal lands on the field it
// concerns rather than as a sentence naming a parameter (server/utils/validation.ts).
function mapFieldRefusal(error: unknown): boolean {
  const says = refusalText(error, '')
  if (!says.startsWith('Invalid request:')) return false
  const paths = says.slice('Invalid request:'.length).split(',').map(path => path.trim())
  if (paths.includes('guest.email')) fieldErrors.email = 'That does not look like an email address. Check it and try again.'
  if (paths.includes('guest.name')) fieldErrors.name = 'Tell us the name the booking is under.'
  return fieldErrors.email !== null || fieldErrors.name !== null
}

async function book(): Promise<void> {
  notice.value = null
  externalUrl.value = null
  fieldErrors.name = null
  fieldErrors.email = null

  if (lines.value.length === 0) {
    notice.value = 'Choose at least one ticket'
    return
  }
  if (!account.value.signedIn && !checkDetails()) return

  submitting.value = true
  try {
    const body: { performanceId: string, lines: typeof lines.value, guest?: { name: string, email: string } } = {
      performanceId: performanceId.value,
      lines: lines.value,
    }
    if (!account.value.signedIn) body.guest = { name: guestName.value.trim(), email: guestEmail.value.trim() }

    const result = await $fetch<Confirmation>('/api/reservations', { method: 'POST', body })
    sentTo.value = body.guest?.email ?? account.value.user?.email ?? null
    confirmation.value = result
  }
  catch (error) {
    if (!mapFieldRefusal(error)) notice.value = refusalText(error)
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
    <UBreadcrumb
      class="mb-6"
      :items="[
        { label: data!.show.title, to: `/shows/${data!.show.slug}` },
        { label: 'Book tickets' },
      ]"
      data-test="booking-breadcrumb"
    />

    <UPageHeader
      :title="`Book · ${data!.show.title}`"
      :description="`${when} · ${data!.performance.venueName}`"
      :ui="{ title: 'nnt-headline' }"
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
      <p
        v-if="sentTo"
        class="text-sm text-muted"
        data-test="booking-emailed"
      >
        We have emailed the reference and your QR code to {{ sentTo }}. Bring either one to the
        box office.
      </p>
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
        :icon="data!.refusal.waitingListUrl ? 'i-lucide-clock' : 'i-lucide-ticket-x'"
        :title="data!.refusal.waitingListUrl ? 'Sold out' : 'Booking is not open'"
        :description="data!.refusal.says"
        data-test="booking-refused"
      />
      <UButton
        v-if="data!.refusal.waitingListUrl"
        class="mt-4"
        :to="data!.refusal.waitingListUrl"
        variant="poster"
        data-test="booking-waiting-list"
      >
        Join the waiting list
      </UButton>
      <UButton
        v-else-if="data!.refusal.externalBookingUrl"
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

        <section
          v-if="nights.length > 1"
          data-test="pick-performance"
        >
          <h2 class="nnt-headline text-xl">
            1 · Pick a performance
          </h2>

          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <NuxtLink
              v-for="night in nights"
              :key="night.id"
              :to="`/book/${night.id}`"
              class="rounded-lg border p-4 transition-colors"
              :class="night.id === performanceId
                ? 'border-primary bg-primary/5'
                : 'border-default hover:border-primary'"
              :aria-current="night.id === performanceId ? 'page' : undefined"
              :data-test="`night-${night.id}`"
            >
              <p class="flex flex-wrap items-baseline gap-x-2 font-medium">
                <span>{{ nightWhen(night.startsAt) }}</span>
                <!-- The chosen night is marked by a word as well as by its border, because a
                     border is a colour and state is never only a colour (K-101 criterion 3). -->
                <span
                  v-if="night.id === performanceId"
                  class="font-mono text-xs uppercase tracking-wide text-primary"
                >Booking this night</span>
              </p>
              <p
                class="text-sm"
                :class="night.availability === 'LIMITED' ? 'text-gold-700 dark:text-gold-400' : 'text-muted'"
              >
                {{ saysNightLine(night, acrossVenues) }}
              </p>
            </NuxtLink>
          </div>
        </section>

        <section>
          <h2 class="nnt-headline text-xl">
            {{ nights.length > 1 ? '2' : '1' }} · Tickets
          </h2>

          <div
            v-if="memberPrice"
            class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-elevated p-4"
            data-test="member-prices"
          >
            <p class="text-sm">
              Current members pay less for this performance. The prices below are the ones anybody
              can book.
            </p>
            <UButton
              :to="`/sign-in?next=${encodeURIComponent(`/book/${performanceId}`)}`"
              variant="subtle"
              size="sm"
              class="shrink-0"
            >
              Sign in for member prices
            </UButton>
          </div>

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
                  :aria-label="`${type.name} tickets`"
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

        <!-- H-201's marketing consent is a V2 story and has nowhere to be stored yet, so this
             section asks for nothing it cannot keep (booking.png, H-201). -->
        <section v-if="!account.signedIn">
          <h2 class="nnt-headline text-xl">
            {{ nights.length > 1 ? '3' : '2' }} · Your details
          </h2>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <UFormField
              label="Name"
              required
              :error="fieldErrors.name ?? undefined"
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
              description="Your tickets land here."
              :error="fieldErrors.email ?? undefined"
            >
              <UInput
                v-model="guestEmail"
                type="email"
                class="w-full"
                autocomplete="email"
                icon="i-lucide-mail"
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
          <p class="font-mono text-xs uppercase tracking-wide text-muted">
            Your order
          </p>
          <h2 class="mt-1 font-semibold">
            {{ data!.show.title }}
          </h2>
          <p class="text-sm text-muted">
            {{ when }} · {{ data!.performance.venueName }}
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

        <div class="mt-4 flex items-baseline justify-between gap-4 text-sm text-muted">
          <span>Paid online</span>
          <span class="font-mono">{{ saysPrice(0) }}, ever</span>
        </div>

        <div class="mt-2 flex items-baseline justify-between gap-4">
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
          <!-- Rendered whether or not it holds anything, so a refusal that appears later is
               announced rather than arriving in a region the reader's software never saw. -->
          <div
            role="alert"
            aria-live="polite"
            data-test="booking-live"
          >
            <div
              v-if="notice"
              id="booking-refusal"
              data-test="booking-notice"
            >
              <UAlert
                class="mb-3"
                color="error"
                variant="subtle"
                :description="notice"
              />
            </div>
            <div
              v-if="capReason"
              id="booking-cap"
              data-test="booking-over-cap"
            >
              <UAlert
                class="mb-3"
                color="warning"
                variant="subtle"
                :description="capReason"
              />
            </div>
          </div>
          <UButton
            variant="marquee"
            size="lg"
            block
            :loading="submitting"
            :disabled="capReason !== null"
            :aria-describedby="describedBy"
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
          <p
            class="mt-3 text-sm text-muted"
            data-test="hold-release"
          >
            Reservations hold until {{ data!.holdReleaseMinutes }} minutes before curtain, then the
            tickets go back on sale for walk-ups.
          </p>
        </template>
      </UCard>
    </div>
  </UContainer>
</template>
