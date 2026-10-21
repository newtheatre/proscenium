<script setup lang="ts">
import type { PassSaleReceipt } from '#shared/utils/sale'

// What became of a pass sold on the till (D-134): its reference, and tonight's booking if any.
defineProps<{ receipt: PassSaleReceipt }>()
</script>

<template>
  <div
    class="space-y-2"
    data-test="pass-sold"
  >
    <UAlert
      color="success"
      variant="subtle"
      :title="`${receipt.passTypeName} issued to ${receipt.holderName}`"
      :description="`Reference ${receipt.reference}. The pass and its QR are on their way by email.`"
    />
    <UAlert
      v-if="receipt.movedBooking"
      color="info"
      variant="subtle"
      data-test="pass-moved-booking"
      :description="`Their booking ${receipt.movedBooking.from} for ${receipt.movedBooking.showTitle} is now on the pass as ${receipt.movedBooking.to}. Nothing more to pay for tonight.`"
    />
    <UAlert
      v-if="receipt.keptBooking"
      color="warning"
      variant="subtle"
      data-test="pass-kept-booking"
      :description="receipt.keptBooking"
    />
  </div>
</template>
