<script setup lang="ts">
import type { ResolveOutcome, SumupAttemptView } from '#shared/utils/sumup'

// A typed charge waiting for the person at the reader (0096, F-104 criterion 6 as amended): the
// figure to key, read across a bar before the card goes in. The answers sit under the thumb.

defineProps<{
  pending: { id: string, totalPence: number }
  waiting: SumupAttemptView | null
  waitingFailure: string | null
  resolving: boolean
}>()

const emit = defineEmits<{
  resolve: [id: string, outcome: ResolveOutcome, note: string | null]
}>()

const abandonNote = defineModel<string>('abandonNote', { required: true })
</script>

<template>
  <div
    class="space-y-3"
    data-test="reader-charge"
  >
    <TillChargeFigure
      label="Key this into the reader"
      :pence="pending.totalPence"
    >
      <p class="mt-2 text-sm text-muted">
        Nothing is recorded until you answer below.
      </p>
    </TillChargeFigure>

    <UAlert
      v-if="waitingFailure"
      color="error"
      variant="subtle"
      :description="waitingFailure"
      data-test="reader-charge-failure"
    />

    <!-- The reader took money the till could not record (0069's mismatch): record it again once
         the cause is put right, or give it up with a note saying where the money went. -->
    <div
      v-if="waiting?.status === 'MISMATCH'"
      class="space-y-2"
      data-test="reader-charge-mismatch"
    >
      <p class="text-sm">
        Taken on the reader, not recorded. Tell the duty manager.
      </p>
      <UTextarea
        v-model="abandonNote"
        placeholder="What happened to the money the reader took?"
        class="w-full"
        data-test="reader-charge-note"
      />
      <UButton
        color="neutral"
        variant="subtle"
        class="min-h-12"
        :loading="resolving"
        :disabled="!abandonNote.trim()"
        data-test="reader-charge-give-up"
        @click="emit('resolve', pending.id, 'abandoned', abandonNote.trim())"
      >
        Give up, with note
      </UButton>
    </div>
  </div>
</template>
