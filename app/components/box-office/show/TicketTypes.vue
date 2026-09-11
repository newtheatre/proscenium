<script setup lang="ts">
import type { AdminShow } from '#shared/utils/programme'

// What the show charges, over the ticket type's own price. A performance's own overrides live on
// the performances tab, beside the performance they belong to (D-120).

const props = defineProps<{ show: AdminShow }>()
</script>

<template>
  <div data-test="show-prices">
    <TicketPrices
      level="show"
      :endpoint="`/api/admin/shows/${props.show.id}/prices`"
    />
  </div>
</template>
