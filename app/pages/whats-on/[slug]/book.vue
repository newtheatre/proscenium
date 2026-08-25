<script setup lang="ts">
/**
 * The multi-step booking flow: performance, tickets, details, confirmation.
 */

interface BookingResult {
  id: string
  bookingRef: string
  status: string
  customerNotes: string | null
  user: { id: string, name: string, email: string }
  performance: {
    startsAt: string | Date
    doorsAt: string | Date | null
    durationMinutes: number | null
    show: { id: string, title: string, slug: string }
    venue: { id: string, name: string, address?: string | null }
  }
  tickets: Array<{
    id: string
    pricePaid: number
    ticketType: { id: string, name: string }
  }>
}

interface MyBookingOptions {
  accessTypes: Array<{
    id: string
    name: string
    description: string | null
    effectivePrice: number
    active: boolean
    accessKind: string | null
    maxQuantity: number
  }>
  pass: { id: string, reference: string, name: string } | null
}

const route = useRoute()
const toast = useToast()
const { loggedIn, user } = useUserSession()
// Forwards the session cookie during SSR; plain $fetch does not (ADR-0013).
const requestFetch = useRequestFetch()

const slug = route.params.slug as string

// Fetch show data
const { data: show, status: showStatus, error: showError } = await useFetch(`/api/whats-on/${slug}`, {
  key: `booking-show-${slug}`,
})

if (showError.value) {
  throw createError({
    statusCode: showError.value.statusCode ?? 404,
    statusMessage: 'Show not found',
    fatal: true,
  })
}

useSeoMeta({
  title: () => show.value ? `Book – ${show.value.title}` : 'Book Tickets',
})

// ── State ────────────────────────────────────────────────────────────────────

// Externally ticketed: the flow cannot complete, so do not start it (#135).
// Every performance, or the selected one, being external is enough.
const allExternal = computed(() => {
  const performances = show.value?.performances ?? []
  return Boolean(show.value?.externalUrl)
    || (performances.length > 0 && performances.every(p => p.isExternallyTicketed))
})

watchEffect(() => {
  if (allExternal.value) {
    navigateTo(`/whats-on/${slug}`, { replace: true })
  }
})

const currentStep = ref(0)
const selectedPerformanceId = ref<string | null>((route.query.performance as string) ?? null)
const selectedTickets = ref<Array<{ ticketTypeId: string, quantity: number }>>([])
const customerInfo = ref({
  name: user.value?.name ?? '',
  email: user.value?.email ?? '',
  customerNotes: '',
})
const isSubmitting = ref(false)
const bookingResult = ref<BookingResult | null>(null)

// Watch for user login to auto-fill details
watch(() => user.value, (newUser) => {
  if (newUser && !customerInfo.value.name) {
    customerInfo.value.name = newUser.name
    customerInfo.value.email = newUser.email
  }
}, { immediate: true })

// ── Computed ─────────────────────────────────────────────────────────────────

const selectedPerformance = computed(() => {
  return show.value?.performances.find(p => p.id === selectedPerformanceId.value) ?? null
})

// What this account adds to the public picker. Session-dependent, so it is a
// separate call from the cacheable show payload.
const { data: myOptions } = await useAsyncData(
  () => `book-my-options-${selectedPerformanceId.value ?? 'none'}`,
  () => selectedPerformanceId.value && loggedIn.value
    ? requestFetch<MyBookingOptions>('/api/bookings/my-options', {
        query: { performanceId: selectedPerformanceId.value },
      })
    : Promise.resolve(null),
  { watch: [selectedPerformanceId, loggedIn] },
)

const selectedPerformanceTicketTypes = computed(() => [
  ...(selectedPerformance.value?.ticketTypes ?? []),
  ...(myOptions.value?.accessTypes ?? []),
])

const redeemablePass = computed(() => myOptions.value?.pass ?? null)

const remainingCapacity = computed(() => {
  if (!selectedPerformance.value) return null
  if (selectedPerformance.value.capacity === null) return null
  return selectedPerformance.value.capacity - selectedPerformance.value.ticketsSold
})

const totalTickets = computed(() => {
  return selectedTickets.value.reduce((sum, t) => sum + t.quantity, 0)
})

// ── Step validation ──────────────────────────────────────────────────────────

const canProceedFromPerformance = computed(() => {
  return selectedPerformanceId.value !== null
})

const canProceedFromTickets = computed(() => {
  return totalTickets.value > 0
})

const canProceedFromDetails = computed(() => {
  return customerInfo.value.name.trim().length > 0
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerInfo.value.email)
})

const redeemingPass = ref(false)

/**
 * A pass books a reservation of its own rather than joining the basket: it is
 * an entitlement, not a ticket type with a price (docs/10 §4).
 */
async function useMyPass() {
  if (!redeemablePass.value || !selectedPerformanceId.value) return
  redeemingPass.value = true
  try {
    const result = await $fetch<{ reservationId: string }>('/api/passes/mine/redeem', {
      method: 'POST',
      body: { passId: redeemablePass.value.id, performanceId: selectedPerformanceId.value },
    })
    toast.add({ title: 'Booked on your pass', icon: 'i-lucide-check', color: 'success' })
    await navigateTo(`/account/reservations?booked=${result.reservationId}`)
  }
  catch (error) {
    toast.add({
      title: 'Could not use your pass',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
      color: 'error',
    })
  }
  finally {
    redeemingPass.value = false
  }
}

const steps = computed(() => [
  {
    title: 'Performance',
    description: 'Choose date & time',
    icon: 'i-lucide-calendar' as const,
  },
  {
    title: 'Tickets',
    description: 'Select your tickets',
    icon: 'i-lucide-ticket' as const,
  },
  {
    title: 'Details',
    description: 'Your information',
    icon: 'i-lucide-user' as const,
  },
  {
    title: 'Confirm',
    description: 'Review & book',
    icon: 'i-lucide-check-circle' as const,
  },
])

// ── Navigation ───────────────────────────────────────────────────────────────

function nextStep() {
  if (currentStep.value < steps.value.length - 1) {
    currentStep.value++
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

function goToStep(step: number) {
  // Only allow going to completed or current steps
  if (step <= currentStep.value) {
    currentStep.value = step
  }
}

function handlePerformanceSelect(performanceId: string) {
  // If changing performance, reset tickets
  if (selectedPerformanceId.value !== performanceId) {
    selectedTickets.value = []
  }
  selectedPerformanceId.value = performanceId
}

// If performance was pre-selected and is valid, skip to tickets
if (selectedPerformanceId.value && show.value?.performances.some(p => p.id === selectedPerformanceId.value && !p.isSoldOut && !p.isBookingClosed)) {
  currentStep.value = 1
}

// Advance from the tickets step to the details step.
function handleNextFromTickets() {
  currentStep.value = 2
}

// ── Submission ───────────────────────────────────────────────────────────────

async function submitBooking() {
  if (!selectedPerformanceId.value || totalTickets.value === 0) return

  isSubmitting.value = true

  try {
    const body: Record<string, unknown> = {
      performanceId: selectedPerformanceId.value,
      tickets: selectedTickets.value.filter(t => t.quantity > 0),
      customerNotes: customerInfo.value.customerNotes || undefined,
    }

    // Only send name/email if not logged in
    if (!loggedIn.value) {
      body.name = customerInfo.value.name
      body.email = customerInfo.value.email
    }

    const result = await $fetch<BookingResult>('/api/bookings', {
      method: 'POST',
      body,
    })

    bookingResult.value = result

    toast.add({
      title: 'Booking confirmed!',
      description: `Your booking reference is ${result?.bookingRef}`,
      color: 'success',
      icon: 'i-lucide-check-circle',
    })
  }
  catch (err: unknown) {
    const error = err as { data?: { statusMessage?: string }, message?: string }
    const message = error?.data?.statusMessage ?? error?.message ?? 'Something went wrong'
    toast.add({
      title: 'Booking failed',
      description: message,
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UContainer class="py-8 lg:py-12 max-w-3xl">
    <!-- Loading -->
    <div
      v-if="showStatus === 'pending'"
      class="space-y-6"
    >
      <USkeleton class="h-8 w-1/2" />
      <USkeleton class="h-12 w-full" />
      <USkeleton class="h-64 w-full" />
    </div>

    <template v-else-if="show">
      <!-- Breadcrumb -->
      <UBreadcrumb
        :items="[
          { label: 'What\'s On', to: '/whats-on' },
          { label: show.title, to: `/whats-on/${slug}` },
          { label: 'Book' },
        ]"
        class="mb-6"
      />

      <!-- Booking confirmed -->
      <BookingConfirmation
        v-if="bookingResult"
        :booking="bookingResult"
      />

      <!-- Booking flow -->
      <template v-else>
        <h1 class="text-2xl font-bold text-default mb-2">
          Book – {{ show.title }}
        </h1>
        <p
          v-if="show.subtitle"
          class="text-muted mb-6"
        >
          {{ show.subtitle }}
        </p>

        <!-- Stepper indicator -->
        <UStepper
          :items="steps"
          :model-value="currentStep"
          color="primary"
          class="mb-8"
          @update:model-value="goToStep($event as number)"
        />

        <!-- Step 1: Performance -->
        <div v-show="currentStep === 0">
          <BookingPerformanceSelect
            :performances="show.performances"
            :selected-performance-id="selectedPerformanceId"
            @select="handlePerformanceSelect"
          />

          <div class="mt-6 flex justify-end">
            <UButton
              label="Continue"
              trailing-icon="i-lucide-arrow-right"
              :disabled="!canProceedFromPerformance"
              @click="nextStep"
            />
          </div>
        </div>

        <!-- Step 2: Tickets -->
        <div v-show="currentStep === 1">
          <div
            v-if="redeemablePass"
            class="mb-6 rounded-lg border border-primary/40 bg-primary/5 p-4"
          >
            <p class="font-medium">
              Use my pass: &pound;0
            </p>
            <p class="mt-1 text-sm text-muted">
              {{ redeemablePass.name }} &middot; {{ redeemablePass.reference }}.
              This books your seat now; a pass is an entitlement, so it is still subject to capacity.
            </p>
            <UButton
              class="mt-3"
              :loading="redeemingPass"
              label="Book on my pass"
              @click="useMyPass"
            />
          </div>

          <BookingTicketSelect
            v-model="selectedTickets"
            :ticket-types="selectedPerformanceTicketTypes"
            :remaining-capacity="remainingCapacity"
          />

          <div class="mt-6 flex justify-between">
            <UButton
              label="Back"
              icon="i-lucide-arrow-left"
              variant="ghost"
              color="neutral"
              @click="prevStep"
            />
            <UButton
              label="Continue"
              trailing-icon="i-lucide-arrow-right"
              :disabled="!canProceedFromTickets"
              @click="handleNextFromTickets"
            />
          </div>
        </div>

        <!-- Step 3: Details -->
        <div v-show="currentStep === 2">
          <BookingCustomerDetails
            v-model="customerInfo"
            :is-logged-in="loggedIn"
            :user-name="user?.name"
            :user-email="user?.email"
          />

          <div class="mt-6 flex justify-between">
            <UButton
              label="Back"
              icon="i-lucide-arrow-left"
              variant="ghost"
              color="neutral"
              @click="prevStep"
            />
            <UButton
              label="Review Booking"
              trailing-icon="i-lucide-arrow-right"
              :disabled="!canProceedFromDetails"
              @click="nextStep"
            />
          </div>
        </div>

        <!-- Step 4: Confirm -->
        <div v-show="currentStep === 3">
          <BookingSummary
            v-if="selectedPerformance"
            :show-title="show.title"
            :performance="selectedPerformance"
            :tickets="selectedTickets"
            :ticket-types="selectedPerformanceTicketTypes"
            :customer-name="customerInfo.name"
            :customer-email="customerInfo.email"
            :customer-notes="customerInfo.customerNotes"
            :is-submitting="isSubmitting"
            @confirm="submitBooking"
            @edit:performance="goToStep(0)"
            @edit:tickets="goToStep(1)"
            @edit:details="goToStep(2)"
          />
        </div>
      </template>
    </template>
  </UContainer>
</template>
