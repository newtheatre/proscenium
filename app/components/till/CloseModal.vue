<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { closeBreakdown, readerExpectation, saysWhereItWasTaken } from '#shared/utils/reconciliation'
import type { NightReconciliation } from '#shared/utils/reconciliation'

// What the till took, and what the reader shows (F-102 criterion 4, F-118 criteria 1 to 3):
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

// One reader and one login serve the desk and the bar on a show night, so the lead is the whole
// night's figure (issue 1308); the lines under it are this bar's own, nought ones left out.
const expected = computed(() => (props.reconciliation ? readerExpectation(props.reconciliation) : null))
const lines = computed(() => (props.reconciliation ? closeBreakdown(props.reconciliation.bar) : []))
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
        v-else-if="reconciliation && expected"
        class="space-y-4"
        :class="{ 'opacity-50': refreshing }"
      >
        <div
          class="rounded-xl bg-elevated px-4 py-4"
          data-test="reader-should-show"
        >
          <p class="text-lg font-semibold">
            The reader should show <span
              class="font-mono tabular-nums"
              data-test="expected-pence"
            >{{ saysMoney(expected.totalPence) }}</span>
          </p>
          <p
            v-if="saysWhereItWasTaken(expected)"
            class="mt-1 text-sm text-muted"
            data-test="expected-split"
          >
            {{ saysWhereItWasTaken(expected) }}
          </p>
        </div>

        <dl
          v-if="lines.length"
          data-test="reconciliation-breakdown"
          class="space-y-1 text-sm"
        >
          <p class="text-xs text-muted">
            This bar tonight
          </p>
          <div
            v-for="line in lines"
            :key="line.label"
            class="flex justify-between"
          >
            <dt>{{ line.label }}</dt>
            <dd>{{ saysMoney(line.pence) }}</dd>
          </div>
        </dl>

        <UFormField label="What the reader's Z actually reads">
          <UInputNumber
            v-model="actualZPounds"
            :min="0"
            :step="0.01"
            :format-options="{ style: 'currency', currency: 'GBP' }"
            data-test="actual-z-input"
          />
        </UFormField>

        <UAlert
          v-if="needsVarianceNote"
          data-test="variance-preview"
          color="warning"
          variant="subtle"
          :description="`${saysMoney(Math.abs(variancePreviewPence))} ${variancePreviewPence > 0 ? 'over' : 'under'} what the reader should show. Say why before closing.`"
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
