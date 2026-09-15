<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { saysAttemptStatus } from '#shared/utils/sumup'
import type { SumupAttemptView } from '#shared/utils/sumup'

// F-124 criteria 5 and 6: the hand-off this screen started, waiting for an answer, and any other
// hand-off tonight still open, so a laptop can answer for a phone that left one.

defineProps<{
  pending: { id: string, totalPence: number } | null
  waiting: SumupAttemptView | null
  waitingFailure: string | null
  resolving: boolean
  openAttempts: SumupAttemptView[]
  timeOf: (at: number) => string
}>()

const emit = defineEmits<{
  checkAgain: []
  resolve: [id: string, outcome: 'succeeded' | 'abandoned', note: string | null]
}>()

const smpTxCodeTyped = defineModel<string>('smpTxCodeTyped', { required: true })
const abandonNote = defineModel<string>('abandonNote', { required: true })
</script>

<template>
  <!-- A hand-off the SumUp app has not answered for (F-124 criterion 5). -->
  <NightBlock
    v-if="pending"
    title="Waiting for SumUp"
    data-test="sumup-waiting"
  >
    <p class="text-lg font-semibold">
      {{ saysMoney(pending.totalPence) }} handed to the SumUp app.
    </p>
    <p
      class="mt-1 text-sm text-muted"
      data-test="sumup-waiting-status"
    >
      {{ waiting ? saysAttemptStatus(waiting.status) : 'Not answered yet.' }}
      <span v-if="waiting?.status === 'MISMATCH'">{{ waiting.error }}</span>
    </p>
    <UAlert
      v-if="waitingFailure"
      class="mt-2"
      color="error"
      variant="subtle"
      :description="waitingFailure"
      data-test="sumup-waiting-failure"
    />
    <p class="mt-3 text-sm">
      Did the payment go through on the reader?
    </p>
    <UInput
      v-model="smpTxCodeTyped"
      placeholder="Transaction code from the SumUp app (optional)"
      class="mt-2 w-full"
      data-test="sumup-tx-code"
    />
    <UTextarea
      v-if="waiting?.status === 'MISMATCH'"
      v-model="abandonNote"
      placeholder="If you are abandoning this: what happened to the money the reader took?"
      class="mt-2 w-full"
      data-test="sumup-abandon-note"
    />
    <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      <UButton
        color="primary"
        class="min-h-12 justify-center"
        :loading="resolving"
        data-test="sumup-went-through"
        @click="emit('resolve', pending.id, 'succeeded', null)"
      >
        It went through
      </UButton>
      <UButton
        color="neutral"
        variant="subtle"
        class="min-h-12 justify-center"
        :loading="resolving"
        data-test="sumup-did-not"
        @click="emit('resolve', pending.id, 'abandoned', abandonNote.trim() || null)"
      >
        It did not
      </UButton>
      <UButton
        color="neutral"
        variant="ghost"
        class="min-h-12 justify-center"
        icon="i-lucide-refresh-cw"
        data-test="sumup-check-again"
        @click="emit('checkAgain')"
      >
        Check again
      </UButton>
    </div>
    <p class="mt-2 text-xs text-muted">
      Nothing happened? The SumUp app is not on this device: say it did not, and key the figure into the reader.
    </p>
  </NightBlock>

  <!-- Tonight's other hand-offs still waiting, so the laptop can answer for a phone (criterion 6). -->
  <NightBlock
    v-if="openAttempts.length"
    title="Unanswered SumUp payments"
    data-test="sumup-open-attempts"
  >
    <div
      v-for="attempt in openAttempts"
      :key="attempt.id"
      class="border-b border-default py-2 last:border-b-0"
      :data-test="`sumup-open-${attempt.id}`"
    >
      <p class="text-sm">
        <span class="font-semibold">{{ saysMoney(attempt.expectedTotalPence) }}</span>
        · {{ timeOf(attempt.createdAt) }}<span v-if="attempt.createdByName"> · {{ attempt.createdByName }}</span>
        · {{ saysAttemptStatus(attempt.status) }}
      </p>
      <p
        v-if="attempt.error"
        class="text-xs text-muted"
      >
        {{ attempt.error }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        <UButton
          size="sm"
          class="min-h-10"
          :loading="resolving"
          :data-test="`sumup-open-succeeded-${attempt.id}`"
          @click="emit('resolve', attempt.id, 'succeeded', null)"
        >
          It went through
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="subtle"
          class="min-h-10"
          :loading="resolving"
          :data-test="`sumup-open-abandoned-${attempt.id}`"
          @click="emit('resolve', attempt.id, 'abandoned', attempt.status === 'MISMATCH' ? (abandonNote.trim() || null) : null)"
        >
          It did not
        </UButton>
      </div>
    </div>
  </NightBlock>
</template>
