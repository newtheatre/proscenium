/**
 * What this app knows about one person. Identity, roles and credentials are
 * stage-door's and are deliberately absent (docs/04-auth-and-permissions.md).
 */
<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['staff'],
  title: 'User',
})

interface Summary {
  person: { id: string, name: string, email: string, anonymisedAt: string | null, createdAt: string }
  reservations: Array<{ id: string, bookingRef: string, status: string, startsAt: string, showTitle: string, tickets: number, paidPence: number }>
  passes: Array<{ id: string, reference: string, status: string, pricePaid: number | null, typeName: string | null }>
  shifts: Array<{ id: string, role: string, status: string, needsEligibilityReview: boolean, startsAt: string, showTitle: string }>
  wrote: { incidents: number, ageChecks: number }
  access?: { status: string, companions: number, consentFohAt: string | null, expiresAt: string | null } | null
}

const route = useRoute()
const config = useRuntimeConfig()
const requestFetch = useRequestFetch()

const { data, error } = await useAsyncData(`user-${route.params.id}`, () =>
  requestFetch<Summary>(`/api/users/${route.params.id}/summary`))

const person = computed(() => data.value?.person ?? null)
const spend = computed(() =>
  (data.value?.reservations ?? []).reduce((total, r) => total + r.paidPence, 0))
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="No mirror row for that account"
      description="Somebody only has a row here once they have booked, been issued a pass, or signed in."
    />

    <template v-else-if="data && person">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold">
            {{ person.name }}
          </h1>
          <p class="text-sm text-muted">
            {{ person.email }}
          </p>
        </div>
        <UButton
          :to="`${config.public.authBaseURL}/admin/users`"
          target="_blank"
          variant="subtle"
          icon="i-lucide-external-link"
          label="Identity & roles in stage-door"
        />
      </div>

      <!-- An erased row is otherwise just a strange-looking name in a list. -->
      <UAlert
        v-if="person.anonymisedAt"
        color="neutral"
        variant="subtle"
        icon="i-lucide-user-x"
        title="This account has been erased"
      >
        <template #description>
          Identifying fields were replaced on {{ formatDate(person.anonymisedAt) }} under the
          retention policy. The rows below survive so booking history and revenue analysis do
          (ADR-0014), and this row must never be written back over.
        </template>
      </UAlert>

      <div class="grid gap-4 sm:grid-cols-3">
        <UCard>
          <p class="text-2xl font-semibold">
            {{ data.reservations.length }}
          </p>
          <p class="text-sm text-muted">
            bookings
          </p>
        </UCard>
        <UCard>
          <p class="text-2xl font-semibold">
            {{ formatMoney(spend) }}
          </p>
          <p class="text-sm text-muted">
            paid, excluding refunds
          </p>
        </UCard>
        <UCard>
          <p class="text-2xl font-semibold">
            {{ data.shifts.length }}
          </p>
          <p class="text-sm text-muted">
            shifts on the rota
          </p>
        </UCard>
      </div>

      <UCard v-if="data.access !== undefined">
        <template #header>
          <p class="font-medium">
            Access profile
          </p>
        </template>
        <p
          v-if="!data.access"
          class="text-sm text-muted"
        >
          None recorded.
        </p>
        <div
          v-else
          class="flex flex-wrap items-center gap-2 text-sm"
        >
          <UBadge
            :color="data.access.status === 'VERIFIED' ? 'success' : 'neutral'"
            variant="subtle"
          >
            {{ data.access.status.toLowerCase() }}
          </UBadge>
          <UBadge
            v-if="!data.access.consentFohAt"
            color="error"
            variant="subtle"
          >
            no consent
          </UBadge>
          <span v-if="data.access.companions">+{{ data.access.companions }} companion</span>
          <span
            v-if="data.access.expiresAt"
            class="text-muted"
          >
            until {{ formatDate(data.access.expiresAt) }}
          </span>
          <ULink
            to="/admin/access"
            class="ml-auto text-sm"
          >
            Manage
          </ULink>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <p class="font-medium">
            Bookings
          </p>
        </template>
        <ul class="divide-y divide-default">
          <li
            v-for="reservation in data.reservations"
            :key="reservation.id"
            class="flex items-center justify-between gap-3 py-2"
          >
            <div>
              <p class="text-sm font-medium">
                {{ reservation.showTitle }}
                <span class="font-mono text-xs text-muted">{{ reservation.bookingRef }}</span>
              </p>
              <p class="text-xs text-muted">
                {{ formatDateTime(reservation.startsAt) }} · {{ reservation.tickets }} tickets
              </p>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <span>{{ formatMoney(reservation.paidPence) }}</span>
              <UBadge
                variant="subtle"
                color="neutral"
              >
                {{ reservation.status.toLowerCase().replace('_', ' ') }}
              </UBadge>
            </div>
          </li>
        </ul>
        <p
          v-if="!data.reservations.length"
          class="text-sm text-muted"
        >
          No bookings.
        </p>
      </UCard>

      <UCard v-if="data.passes.length">
        <template #header>
          <p class="font-medium">
            Passes
          </p>
        </template>
        <ul class="divide-y divide-default">
          <li
            v-for="pass in data.passes"
            :key="pass.id"
            class="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <span>{{ pass.typeName }} <span class="font-mono text-xs text-muted">{{ pass.reference }}</span></span>
            <UBadge
              variant="subtle"
              color="neutral"
            >
              {{ pass.status.toLowerCase() }}
            </UBadge>
          </li>
        </ul>
      </UCard>

      <UCard v-if="data.shifts.length">
        <template #header>
          <p class="font-medium">
            Shifts
          </p>
        </template>
        <ul class="divide-y divide-default">
          <li
            v-for="shift in data.shifts"
            :key="shift.id"
            class="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <span>
              {{ shift.showTitle }}
              <span class="text-muted">· {{ formatDateTime(shift.startsAt) }}</span>
            </span>
            <div class="flex items-center gap-2">
              <UBadge
                v-if="shift.needsEligibilityReview"
                color="warning"
                variant="soft"
                size="sm"
              >
                check training
              </UBadge>
              <UBadge
                variant="subtle"
                color="neutral"
              >
                {{ shift.role.toLowerCase().replace('_', ' ') }} · {{ shift.status.toLowerCase() }}
              </UBadge>
            </div>
          </li>
        </ul>
      </UCard>

      <UCard v-if="data.wrote.incidents || data.wrote.ageChecks">
        <template #header>
          <p class="font-medium">
            Written as staff
          </p>
        </template>
        <p class="text-sm text-muted">
          {{ data.wrote.incidents }} incident
          {{ data.wrote.incidents === 1 ? 'entry' : 'entries' }} ·
          {{ data.wrote.ageChecks }} ID
          {{ data.wrote.ageChecks === 1 ? 'check' : 'checks' }}.
          Both are append-only records and are read on their own screens.
        </p>
      </UCard>
    </template>
  </div>
</template>
