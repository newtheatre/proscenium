<script setup lang="ts">
import type { OwnBookingListing } from '#shared/utils/reservations'

defineProps<{ bookings: OwnBookingListing[], heading: string, level: 'h1' | 'h2' }>()
</script>

<template>
  <div
    class="space-y-3"
    data-test="qr-own-bookings"
  >
    <component
      :is="level"
      class="nnt-headline text-xl"
    >
      {{ heading }}
    </component>
    <ul
      v-if="bookings.length > 0"
      class="space-y-2"
    >
      <li
        v-for="own in bookings"
        :key="own.reference"
      >
        <!-- A plain link: the booking's address is a server route that sets its cookie, which an
             in-app navigation would never reach (issue 1329). -->
        <a
          :href="own.url"
          class="flex min-h-11 flex-col justify-center rounded-lg border border-default px-3 py-2 hover:border-primary"
        >
          <span class="font-medium">{{ own.showTitle }}</span>
          <span class="text-sm text-muted">{{ own.when }} · {{ own.venueName }} · {{ own.state }} · {{ own.reference }}</span>
        </a>
      </li>
    </ul>
    <slot />
  </div>
</template>
