<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { saysAttemptStatus, typedAndWaiting } from '#shared/utils/sumup'
import { saysClock, saysDay } from '#shared/utils/when'
import type { ResolveOutcome } from '#shared/utils/sumup'
import type { EarlierTillLeftOpen } from '#shared/utils/till'
import type { ListFailure } from '~/composables/useListFailure'

// What ended nights left open, above tonight's till for the Bar Manager (F-102 criterion 5, issue
// 1316): each till closes on its own night's figures, and each charge takes the answers tonight's do.

defineProps<{
  left: EarlierTillLeftOpen
  failure: ListFailure | null
  answering: string | null
}>()

const emit = defineEmits<{
  close: [session: EarlierTillLeftOpen['sessions'][number]]
  answer: [id: string, outcome: ResolveOutcome]
}>()

const notes = defineModel<Record<string, string>>('notes', { required: true })
</script>

<template>
  <!-- A refused read shows too: a Bar Manager with no authenticator otherwise sees nothing at all. -->
  <NightBlock
    v-if="failure || left.sessions.length || left.attempts.length"
    title="Left open from an earlier night"
    data-test="till-earlier"
  >
    <UAlert
      v-if="failure"
      class="mb-2"
      color="error"
      variant="subtle"
      :description="failure.message"
      :actions="failure.enrolPath ? [{ label: 'Set up an authenticator app', to: failure.enrolPath, color: 'error' }] : []"
      data-test="till-earlier-failure"
    />
    <div
      v-for="session in left.sessions"
      :key="session.id"
      class="flex items-center justify-between gap-2 border-b border-default py-2 last:border-b-0"
      :data-test="`earlier-session-${session.id}`"
    >
      <p class="text-sm">
        {{ session.venueName }}, {{ saysDay(session.night) }}: the till is still open.
      </p>
      <UButton
        size="sm"
        color="neutral"
        variant="subtle"
        class="min-h-12 shrink-0"
        icon="i-lucide-lock"
        :data-test="`earlier-close-${session.id}`"
        @click="emit('close', session)"
      >
        Close that till
      </UButton>
    </div>
    <div
      v-for="attempt in left.attempts"
      :key="attempt.id"
      class="border-b border-default py-2 last:border-b-0"
      :data-test="`earlier-attempt-${attempt.id}`"
    >
      <p class="text-sm">
        <span class="font-semibold">{{ saysMoney(attempt.expectedTotalPence) }}</span>
        · {{ attempt.venueName }}, {{ saysDay(attempt.night) }} {{ saysClock(attempt.createdAt) }}<span v-if="attempt.createdByName"> · {{ attempt.createdByName }}</span>
        · {{ saysAttemptStatus(attempt.status, attempt.kind) }}
      </p>
      <p
        v-if="attempt.error"
        class="text-xs text-muted"
      >
        {{ attempt.error }}
      </p>
      <UTextarea
        v-if="attempt.status === 'MISMATCH' || !attempt.sessionOpen"
        v-model="notes[attempt.id]"
        placeholder="If you are abandoning this: what happened to the money the reader took?"
        class="mt-2 w-full"
        :data-test="`earlier-note-${attempt.id}`"
      />
      <!-- Recording the sale needs that night's till open, and how a late card charge lands in the
           ledger is still to be decided, so a closed night's is the Treasurer's (issue 1316). -->
      <p
        v-if="!attempt.sessionOpen"
        class="mt-2 text-xs text-muted"
        :data-test="`earlier-treasurer-${attempt.id}`"
      >
        That night's till is closed, so the sale cannot be recorded here. If the reader took the money,
        the Treasurer records it: say so in the note.
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        <UButton
          v-if="attempt.sessionOpen"
          size="sm"
          class="min-h-12"
          :loading="answering === attempt.id"
          :disabled="answering !== null && answering !== attempt.id"
          :data-test="`earlier-succeeded-${attempt.id}`"
          @click="emit('answer', attempt.id, 'succeeded')"
        >
          {{ attempt.kind === 'TYPED' ? 'Reader took it' : 'Payment went through' }}
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="subtle"
          class="min-h-12"
          :loading="answering === attempt.id"
          :disabled="answering !== null && answering !== attempt.id"
          :data-test="`earlier-${typedAndWaiting(attempt) ? 'declined' : 'abandoned'}-${attempt.id}`"
          @click="emit('answer', attempt.id, typedAndWaiting(attempt) ? 'declined' : 'abandoned')"
        >
          {{ typedAndWaiting(attempt) ? 'Card declined' : 'Payment did not' }}
        </UButton>
      </div>
    </div>
  </NightBlock>
</template>
