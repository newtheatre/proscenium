<script setup lang="ts">
import { boardFeedRows, boardStateFrom, currentBoardState, otherBoardSide, saysBoardSide } from '#shared/utils/backstage'
import { saysClock } from '#shared/utils/when'
import type { BoardMessage, BoardSide } from '#shared/utils/backstage'

// The board as either end reads it (E-121 criterion 7): own last call, the other end's, then
// the side-tagged history. Which end is reading is the one prop that changes the wording.
const props = defineProps<{
  side: BoardSide
  messages: (BoardMessage & { posterLabel?: string })[]
  seen: { messageId: string, seenAt: number }[]
}>()

const rows = computed(() => boardFeedRows(props.messages, props.seen))
const state = computed(() => boardStateFrom(props.side, currentBoardState(rows.value.map(row => row.message))))
const other = computed(() => saysBoardSide(otherBoardSide(props.side)))

function seenAt(messageId: string): number | null {
  return rows.value.find(row => row.message.id === messageId)?.seenAt ?? null
}

function timeOf(at: number): string {
  return saysClock(at)
}

function saysMessage(message: BoardMessage): string {
  return message.milestoneLabel ?? message.body
}

const sideTone: Record<BoardSide, string> = { FOH: 'text-secondary', BACKSTAGE: 'text-info' }
</script>

<template>
  <NightBlock title="Current state">
    <div
      class="grid gap-4 sm:grid-cols-[3fr_2fr]"
      data-test="board-current"
    >
      <div>
        <p class="nnt-headline text-2xl font-bold">
          {{ state.own ? saysMessage(state.own) : 'Nothing called yet' }}
        </p>
        <p
          v-if="state.own"
          class="mt-1 text-sm text-muted"
        >
          sent {{ timeOf(state.own.composedAt) }}
          <span
            v-if="seenAt(state.own.id)"
            class="text-success"
          >· seen by {{ other }} &#10003;</span>
          <span v-else>· not seen yet</span>
        </p>
      </div>

      <div class="sm:text-right">
        <p class="text-lg">
          {{ other }}:
          <span
            class="font-semibold"
            :class="sideTone[otherBoardSide(side)]"
          >{{ state.other ? saysMessage(state.other) : 'nothing yet' }}</span>
        </p>
        <p
          v-if="state.other"
          class="mt-1 text-sm text-muted"
        >
          {{ timeOf(state.other.composedAt) }}
          <span
            v-if="seenAt(state.other.id)"
            class="text-success"
          >· seen &#10003;</span>
          <slot
            v-else
            name="other-unseen"
            :message="state.other"
          >
            <span>· not seen yet</span>
          </slot>
        </p>
      </div>
    </div>
  </NightBlock>

  <slot />

  <section>
    <h2 class="mb-3 font-mono text-xs tracking-[0.2em] text-muted uppercase">
      History
    </h2>
    <div
      class="space-y-2"
      data-test="board-messages"
    >
      <p
        v-if="rows.length === 0"
        class="text-sm text-muted"
      >
        Nothing posted yet.
      </p>
      <div
        v-for="row in rows"
        :key="row.message.id"
        class="flex items-center gap-3 rounded-xl bg-elevated p-3"
        :data-test="`board-message-${row.message.id}`"
      >
        <span
          class="shrink-0 font-semibold"
          :class="sideTone[row.message.side]"
        >{{ saysBoardSide(row.message.side) }}</span>
        <span class="min-w-0 grow">
          {{ saysMessage(row.message) }}
          <span
            v-if="row.message.side === 'BACKSTAGE' && row.message.posterLabel"
            class="ml-1 text-xs text-muted"
          >{{ row.message.posterLabel }}</span>
        </span>
        <span class="shrink-0 font-mono text-xs text-muted">
          {{ timeOf(row.message.composedAt) }}
          <span v-if="row.seenAt">&#10003;</span>
        </span>
        <slot
          name="row-actions"
          :message="row.message"
          :seen-at="row.seenAt"
        />
      </div>
    </div>
    <p class="mt-3 text-center text-sm text-muted">
      Every call is acknowledged: you see when {{ other }} has read it.
    </p>
  </section>
</template>
