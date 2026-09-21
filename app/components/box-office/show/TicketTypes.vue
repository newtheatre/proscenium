<script setup lang="ts">
import type { AdminShow } from '#shared/utils/programme'

// What the show charges, over the ticket type's own price. A performance's own overrides live on
// the performances tab, beside the performance they belong to (D-120).

const props = defineProps<{ show: AdminShow }>()
</script>

<template>
  <UCard data-test="pricing-card">
    <template #header>
      <h3 class="font-semibold">
        Pricing
      </h3>
    </template>

    <div
      class="space-y-4"
      data-test="show-prices"
    >
      <TicketPrices
        level="show"
        :endpoint="`/api/admin/shows/${props.show.id}/prices`"
      />

      <UAlert
        icon="i-lucide-hand-coins"
        color="info"
        variant="subtle"
        data-test="reservation-only"
        description="Reservation only: bookers pay at the box office or the bar, on the Students' Union card reader. There is no online payment."
      />
    </div>
  </UCard>
</template>
