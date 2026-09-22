<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import type { NightReconciliation } from '#shared/utils/reconciliation'

// What the till took, and what the reader shows (F-102 criterion 4, F-118 criterion 3):
// closing mid-service is not a per-sale action, so this stays behind a modal.

const props = defineProps<{
  reconciliationLoading: boolean
  reconciliationFailure: string | null
  reconciliation: NightReconciliation | null
  refreshing: boolean
  variancePreviewPence: number
  closeFailure: string | null
  closingBusy: boolean
}>()
const emit = defineEmits<{ confirm: [] }>()

const open = defineModel<boolean>('open', { required: true })
const actualZPounds = defineModel<number | undefined>('actualZPounds')
const varianceNote = defineModel<string>('varianceNote', { required: true })

// A blank field defaults to nought pence, which a night with nothing sold would agree with by
// accident: Confirm close waits for a reading actually typed in, not the default it started at.
const hasReading = computed(() => typeof actualZPounds.value === 'number' && Number.isFinite(actualZPounds.value))
// No reading yet means no variance to explain, whatever the untyped field would compute to.
const needsVarianceNote = computed(() => hasReading.value && props.variancePreviewPence !== 0)
</script>

<template>
  <UModal
    v-model:open="open"
    title="Close till"
    description="What the till took, and what the reader shows."
  >
    <template #body>
      <div
        v-if="reconciliationLoading"
        data-test="reconciliation-loading"
        class="py-6 text-center text-sm text-muted"
      >
        Working it out&hellip;
      </div>
      <UAlert
        v-else-if="reconciliationFailure"
        data-test="reconciliation-failure"
        color="error"
        variant="subtle"
        :description="reconciliationFailure"
      />
      <div
        v-else-if="reconciliation"
        class="space-y-4"
        :class="{ 'opacity-50': refreshing }"
      >
        <dl
          data-test="reconciliation-breakdown"
          class="space-y-1 text-sm"
        >
          <div class="flex justify-between">
            <dt>Card sales</dt>
            <dd>{{ saysMoney(reconciliation.bar.cardSalesPence) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt>Tab settlements</dt>
            <dd>{{ saysMoney(reconciliation.bar.tabSettlementsPence) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt>Comps ({{ reconciliation.bar.compsCount }})</dt>
            <dd>{{ saysMoney(reconciliation.bar.compsForegonePence) }} forgone</dd>
          </div>
          <div class="flex justify-between">
            <dt>Discounts given</dt>
            <dd>{{ saysMoney(reconciliation.bar.discountsPence) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt>Refunds</dt>
            <dd>{{ saysMoney(reconciliation.bar.refundsPence) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt>Tab charges (credit extended)</dt>
            <dd>{{ saysMoney(reconciliation.bar.tabChargesPence) }}</dd>
          </div>
          <div class="flex justify-between font-medium">
            <dt>Expected on the reader, this bar</dt>
            <dd data-test="expected-pence">
              {{ saysMoney(reconciliation.bar.expectedPence) }}
            </dd>
          </div>
          <div class="flex justify-between text-muted">
            <dt>Desk takings, alongside</dt>
            <dd>{{ saysMoney(reconciliation.deskTakingsPence) }}</dd>
          </div>
        </dl>

        <UFormField label="What the reader's Z actually reads">
          <UInputNumber
            v-model="actualZPounds"
            :min="0"
            :step="0.5"
            :format-options="{ style: 'currency', currency: 'GBP' }"
            data-test="actual-z-input"
          />
        </UFormField>

        <UAlert
          v-if="needsVarianceNote"
          data-test="variance-preview"
          color="warning"
          variant="subtle"
          :description="`${saysMoney(Math.abs(variancePreviewPence))} ${variancePreviewPence > 0 ? 'over' : 'under'} what the till took. Say why before closing.`"
        />

        <UFormField
          v-if="needsVarianceNote"
          label="Why the figures differ"
        >
          <UTextarea
            v-model="varianceNote"
            placeholder="Why the reader and the till differ"
            data-test="variance-note"
          />
        </UFormField>

        <UAlert
          v-if="closeFailure"
          data-test="close-failure"
          color="error"
          variant="subtle"
          :description="closeFailure"
        />

        <UButton
          block
          color="error"
          class="min-h-12"
          :loading="closingBusy"
          :disabled="!hasReading || (needsVarianceNote && !varianceNote.trim())"
          data-test="confirm-close-till"
          @click="emit('confirm')"
        >
          Confirm close
        </UButton>

        <UButton
          block
          color="neutral"
          variant="ghost"
          class="min-h-12"
          data-test="close-till-back"
          @click="open = false"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
