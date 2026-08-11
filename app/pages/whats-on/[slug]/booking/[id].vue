<script setup lang="ts">
/**
 * Booking lookup and confirmation page.
 *
 * Accessible via /whats-on/:slug/booking/:id?ref=BOOKREF
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
    ticketType: { id: string, name: string }
  }>
}

const route = useRoute()
const bookingId = route.params.id as string
const bookingRef = route.query.ref as string | undefined

const { data: booking, status, error, refresh } = await useFetch<BookingDetail>(`/api/bookings/${bookingId}`, {
  key: `booking-${bookingId}`,
  query: bookingRef ? { ref: bookingRef } : undefined,
})

if (error.value) {
  throw createError({
    statusCode: error.value.statusCode ?? 404,
    statusMessage: 'Booking not found',
    fatal: true,
  })
}

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
        :booking-ref="bookingRef"
        class="mt-8"
        @refresh="refresh"
      />
    </template>
  </UContainer>
</template>
