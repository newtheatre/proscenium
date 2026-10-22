<script setup lang="ts">
import { saysPerformanceChoice } from '#shared/utils/tonight'
import type { NightVenueOption } from '#shared/utils/night-venue'

// Where this phone works tonight, on a night two venues run (0230). One row a venue, naming what
// is on there, so the choice is the house and not a room name alone.
defineProps<{
  venues: NightVenueOption[]
  chosenId: string | null
}>()

const emit = defineEmits<{ choose: [venueId: string] }>()
</script>

<template>
  <div
    class="flex flex-col gap-2"
    data-test="venue-switcher"
  >
    <UButton
      v-for="venue in venues"
      :key="venue.venueId"
      block
      class="min-h-12 justify-start"
      :color="venue.venueId === chosenId ? 'primary' : 'neutral'"
      :variant="venue.venueId === chosenId ? 'solid' : 'subtle'"
      :data-test="`venue-${venue.venueId}`"
      @click="emit('choose', venue.venueId)"
    >
      <span class="flex flex-col items-start text-left">
        <span class="font-semibold">{{ venue.venueName }}</span>
        <span class="text-sm opacity-80">{{ venue.performances.map(performance => saysPerformanceChoice(performance)).join(' · ') }}</span>
      </span>
    </UButton>
  </div>
</template>
