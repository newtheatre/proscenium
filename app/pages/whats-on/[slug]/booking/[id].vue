<script setup lang="ts">
/**
 * Booking lookup and confirmation page.
 *
 * Accessible via /whats-on/:slug/booking/:id?t=<signed access token>
 * Shows booking details for confirmation emails and post-booking access.
 */

interface BookingDetail {
  id: string
  bookingRef: string
  status: string
  customerNotes: string | null
  user: { id: string, name: string, email: string }
  performance: {
    id: string
    startsAt: string | Date
    doorsAt: string | Date | null
    durationMinutes: number | null
    show: { id: string, title: string, slug: string, posterUrl: string | null }
    venue: { id: string, name: string, address?: string | null }
  }
  tickets: Array<{
    id: string
    pricePaid: number
    priceConfidence?: 'EXACT' | 'DERIVED' | 'UNKNOWN'
    /** Stamped when the box office refunds this specific ticket. */
    refundedAt: string | Date | null
    ticketType: { id: string, name: string }
  }>
}

const route = useRoute()
const bookingId = route.params.id as string
// A signed, expiring access token from the confirmation email. The booking
// reference is no longer accepted as a credential — it is quoted at the box
// office and printed on every email, so it could not also be the key.
const accessToken = route.query.t as string | undefined

// A guest arriving from a legacy /cancel/:code link carries their token in a
// cookie rather than in the URL, so the server-rendered request has to forward
// the incoming cookies. Plain useFetch does not.
const { data: booking, status, error, refresh } = await useFetch<BookingDetail>(`/api/bookings/${bookingId}`, {
  key: `booking-${bookingId}`,
  query: accessToken ? { t: accessToken } : undefined,
  headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
})

if (error.value) {
  throw createError({
    statusCode: error.value.statusCode ?? 404,
    statusMessage: 'Booking not found',
    fatal: true,
  })
}

// The server moved the token into a cookie on first use, so take it out of the
// address bar. Without this it stays in browser history and in the Referer of
// any outbound link on this page — for a live credential.
onMounted(() => {
  if (!accessToken) return
  const url = new URL(window.location.href)
  url.searchParams.delete('t')
  window.history.replaceState({}, '', url.pathname + url.search + url.hash)
})

useSeoMeta({
  title: () => booking.value ? `Booking ${booking.value.bookingRef}` : 'Booking',
})
</script>

<template>
  <UContainer class="py-8 lg:py-12 max-w-3xl">
    <!-- Loading -->
    <div
      v-if="status === 'pending'"
      class="space-y-6"
    >
      <div class="text-center space-y-3">
        <USkeleton class="size-16 rounded-full mx-auto" />
        <USkeleton class="h-8 w-48 mx-auto" />
        <USkeleton class="h-4 w-64 mx-auto" />
      </div>
      <USkeleton class="h-20 w-full" />
      <USkeleton class="h-40 w-full" />
    </div>

    <template v-else-if="booking">
      <UBreadcrumb
        :items="[
          { label: 'What\'s On', to: '/whats-on' },
          { label: booking.performance.show.title, to: `/whats-on/${booking.performance.show.slug}` },
          { label: `Booking ${booking.bookingRef}` },
        ]"
        class="mb-6"
      />

      <BookingConfirmation :booking="booking" />

      <BookingManage
        :booking="booking"
        :access-token="accessToken"
        class="mt-8"
        @refresh="refresh"
      />
    </template>
  </UContainer>
</template>
