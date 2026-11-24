<!-- The sale just paid for, shown on the till's receipt until the next customer: what was paid, any
     change, and a receipt for someone who asks for one after paying (one for the whole sale, sent once). -->
<script setup lang="ts">
import type { ReceiptTo } from './PaymentsReceiptTo.vue'

defineProps<{
  amountMinor: number
  changeMinor: number
  /** The sale was split, so each person had their own receipt. */
  split: boolean
  receiptSent: boolean
  sending: boolean
  money: (minor: number) => string
}>()
const emit = defineEmits<{ send: [], next: [] }>()
const to = defineModel<ReceiptTo | undefined>('to')
const { t } = useT()
</script>

<template>
  <div
    class="space-y-3"
    role="status"
  >
    <p class="flex items-center gap-2 text-lg font-semibold text-success">
      <UIcon
        name="i-lucide-circle-check"
        class="size-6"
      />{{ t('payments.screens.till.paid', { amount: money(amountMinor) }) }}
    </p>
    <p
      v-if="changeMinor > 0"
      class="text-base font-medium"
    >
      {{ t('payments.screens.till.change', { amount: money(changeMinor) }) }}
    </p>
    <p
      v-if="receiptSent"
      class="flex items-center gap-2 text-sm text-muted"
    >
      <UIcon
        name="i-lucide-mail-check"
        class="size-4"
      />{{ t('payments.screens.till.receipt-sent') }}
    </p>
    <UFormField
      v-else-if="!split"
      :label="t('payments.screens.till.receipt-after')"
      :hint="t('payments.screens.optional')"
    >
      <div class="flex gap-2">
        <PaymentsReceiptTo
          v-model="to"
          class="flex-1"
          :disabled="sending"
        />
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-send"
          :loading="sending"
          :disabled="!to"
          :label="t('payments.screens.till.receipt-send')"
          @click="emit('send')"
        />
      </div>
    </UFormField>
    <UButton
      block
      size="xl"
      class="justify-center"
      icon="i-lucide-user-round-plus"
      :label="t('payments.screens.till.next-customer')"
      @click="emit('next')"
    />
  </div>
</template>
