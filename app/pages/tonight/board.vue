<script setup lang="ts">
import { currentBoardState, liveBoardMessages, saysBoardSide } from '#shared/utils/backstage'
import { formatLondon } from '#shared/utils/london'
import { groupedBoardCode } from '#shared/utils/night-hub'
import type { BoardSide } from '#shared/utils/backstage'

definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Backstage' })

interface Message {
  id: string
  side: BoardSide
  posterLabel: string
  milestoneLabel: string | null
  body: string
  supersedesId: string | null
  composedAt: number
}
interface Preset { id: string, label: string, body: string }
interface Seen { messageId: string, seenAt: number }

const toast = useToast()

const messages = ref<Message[]>([])
const seen = ref<Seen[]>([])
const presets = ref<Preset[]>([])
const boardCode = ref<string | null>(null)
const syncedAt = ref<Date | null>(null)
const busy = ref(true)
const failure = ref<string | null>(null)
const freeText = ref('')

// Typed explicitly (0053): inferring it from the route map alone has grown too deep for tsc.
async function load(): Promise<void> {
  try {
    const answered = await useRequestFetch()<{ messages: Message[], seen: Seen[], presets: Preset[] }>('/api/tonight/board/messages')
    messages.value = answered.messages
    seen.value = answered.seen
    presets.value = answered.presets
    syncedAt.value = new Date()
    failure.value = null
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    busy.value = false
  }
}

async function loadCode(): Promise<void> {
  try {
    boardCode.value = (await $fetch<{ code: string }>('/api/tonight/board/code')).code
  }
  catch { /* the code block just stays hidden; the feed still polls */ }
}

// Within five seconds, the contract E-121 criterion 3 states directly, not a configuration key.
const POLL_MS = 5_000
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  load()
  timer = setInterval(load, POLL_MS)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

interface QueuedMessage { presetId: string | null, body: string | null }

// A connection hole costs nothing: a tap queues and drains on reconnect, carrying the moment it
// was actually composed rather than the moment it finally sent (criterion 6, K-104).
const writeQueue = useWriteQueue<QueuedMessage>(async (action) => {
  try {
    // @ts-expect-error an options-carrying call has no working generic form yet (0053).
    await $fetch<unknown>('/api/tonight/board/messages', {
      method: 'POST',
      body: { ...action.payload, composedAt: Math.floor(action.queuedAt / 1000) },
    })
    await load()
    return { ok: true }
  }
  catch (error) {
    const status = refusalStatus(error)
    // A definite refusal (a retired preset, a malformed body) is not retried; a dropped
    // connection or a server hiccup is.
    if (status !== undefined && status < 500) return { ok: false, retry: false, reason: refusalText(error) }
    return { ok: false, retry: true, reason: refusalText(error) }
  }
})

function sendPreset(id: string): void {
  writeQueue.enqueue('preset', { presetId: id, body: null })
}

function sendFreeText(): void {
  const body = freeText.value.trim()
  if (!body) return
  writeQueue.enqueue('free-text', { presetId: null, body })
  freeText.value = ''
}

async function markSeen(messageId: string): Promise<void> {
  try {
    // @ts-expect-error an options-carrying call has no working generic form yet (0053).
    await $fetch<unknown>('/api/tonight/board/seen', { method: 'POST', body: { messageId } })
    await load()
  }
  catch { /* a tick that failed to record is a tick the duty manager can tap again */ }
}

const live = computed(() => liveBoardMessages(messages.value))
const state = computed(() => currentBoardState(live.value))

function seenAt(messageId: string): number | null {
  return seen.value.find(row => row.messageId === messageId)?.seenAt ?? null
}

function timeOf(at: number): string {
  return formatLondon(new Date(at * 1000), { timeStyle: 'short' })
}

function saysMessage(message: Message): string {
  return message.milestoneLabel ?? message.body
}

const sideTone: Record<BoardSide, string> = { FOH: 'text-secondary', BACKSTAGE: 'text-info' }

const resetting = ref(false)
const resetFailure = ref<string | null>(null)
const confirmingReset = ref(false)

async function reset(): Promise<void> {
  resetting.value = true
  resetFailure.value = null
  try {
    // @ts-expect-error an options-carrying call has no working generic form yet (0053).
    await $fetch<unknown>('/api/tonight/board/reset', { method: 'POST' })
    confirmingReset.value = false
    toast.add({ title: 'Board reset', description: 'Every device was disconnected. Read the new code out loud.', icon: 'i-lucide-check', color: 'success' })
    boardCode.value = null
    await load()
  }
  catch (error) {
    resetFailure.value = refusalText(error)
  }
  finally {
    resetting.value = false
  }
}
</script>

<template>
  <NightScreen
    title="Backstage"
    :stale="syncedAt"
    :busy="busy"
  >
    <div class="space-y-5">
      <UAlert
        v-if="failure"
        data-test="board-failure"
        color="error"
        variant="subtle"
        :description="failure"
      />

      <p
        v-if="writeQueue.connection.value.status === 'offline'"
        data-test="board-offline"
        class="text-sm text-warning"
      >
        {{ writeQueue.connection.value.queued }} message{{ writeQueue.connection.value.queued === 1 ? '' : 's' }} waiting to send.
      </p>

      <NightBlock title="Current state">
        <div
          class="grid gap-4 sm:grid-cols-2"
          data-test="board-current"
        >
          <div>
            <p class="nnt-headline text-2xl font-bold uppercase">
              {{ state.foh ? saysMessage(state.foh) : 'Nothing called yet' }}
            </p>
            <p
              v-if="state.foh"
              class="mt-1 text-sm text-muted"
            >
              sent {{ timeOf(state.foh.composedAt) }}
              <span
                v-if="seenAt(state.foh.id)"
                class="text-success"
              >· seen by backstage &#10003;</span>
              <span v-else>· not seen yet</span>
            </p>
          </div>

          <div class="sm:text-right">
            <p class="text-lg">
              Backstage:
              <span class="font-semibold text-info">{{ state.backstage ? saysMessage(state.backstage) : 'nothing yet' }}</span>
            </p>
            <p
              v-if="state.backstage"
              class="mt-1 text-sm text-muted"
            >
              {{ timeOf(state.backstage.composedAt) }}
              <span
                v-if="seenAt(state.backstage.id)"
                class="text-success"
              >· seen &#10003;</span>
              <UButton
                v-else
                size="xs"
                color="neutral"
                variant="subtle"
                class="ml-1 min-h-8"
                :data-test="`board-seen-${state.backstage.id}`"
                @click="markSeen(state.backstage.id)"
              >
                Mark seen
              </UButton>
            </p>
          </div>
        </div>
      </NightBlock>

      <section>
        <h2 class="mb-3 font-mono text-xs tracking-[0.2em] text-muted uppercase">
          Send to backstage
        </h2>
        <div
          v-if="presets.length"
          class="grid grid-cols-2 gap-3"
          data-test="board-presets"
        >
          <UButton
            v-for="preset in presets"
            :key="preset.id"
            color="neutral"
            variant="outline"
            size="lg"
            class="min-h-14 justify-center text-base font-semibold"
            :data-test="`board-preset-${preset.id}`"
            @click="sendPreset(preset.id)"
          >
            {{ preset.label }}
          </UButton>
        </div>
        <p
          v-else
          class="text-sm text-muted"
        >
          No presets are configured yet.
        </p>

        <form
          class="mt-3 flex gap-3"
          data-test="board-free-text-form"
          @submit.prevent="sendFreeText"
        >
          <UInput
            v-model="freeText"
            placeholder="Free text..."
            size="xl"
            class="w-full"
            data-test="board-free-text-input"
          />
          <UButton
            type="submit"
            color="secondary"
            icon="i-lucide-send"
            size="xl"
            aria-label="Send to backstage"
            class="min-h-14 min-w-14 justify-center"
            data-test="board-free-text-submit"
          />
        </form>
      </section>

      <section>
        <h2 class="mb-3 font-mono text-xs tracking-[0.2em] text-muted uppercase">
          History
        </h2>
        <div
          class="space-y-2"
          data-test="board-messages"
        >
          <p
            v-if="live.length === 0"
            class="text-sm text-muted"
          >
            Nothing posted yet.
          </p>
          <div
            v-for="message in live"
            :key="message.id"
            class="flex items-center gap-3 rounded-xl bg-elevated p-3"
            :data-test="`board-message-${message.id}`"
          >
            <span
              class="shrink-0 font-semibold"
              :class="sideTone[message.side]"
            >{{ saysBoardSide(message.side) }}</span>
            <span class="min-w-0 grow">{{ saysMessage(message) }}</span>
            <span class="shrink-0 font-mono text-xs text-muted">
              {{ timeOf(message.composedAt) }}
              <span v-if="seenAt(message.id)">&#10003;</span>
            </span>
          </div>
        </div>
        <p class="mt-3 text-center text-sm text-muted">
          Every call is acknowledged: you see when backstage has read it.
        </p>
      </section>

      <!-- Shown only on request, never polled or cached: a code sitting on screen is a code
           somebody else can read off it (E-120 criteria 2, 5). -->
      <NightBlock
        title="Tonight's code"
        data-test="board-code"
      >
        <template v-if="boardCode">
          <p
            class="font-mono text-3xl tracking-[0.2em]"
            data-test="board-code-value"
          >
            {{ groupedBoardCode(boardCode) }}
          </p>
          <p class="mt-1 text-sm text-muted">
            Read it out loud. It never travels by email or notification.
          </p>
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            class="mt-2"
            data-test="board-code-hide"
            @click="boardCode = null"
          >
            Hide it
          </UButton>
        </template>
        <UButton
          v-else
          color="neutral"
          variant="subtle"
          class="min-h-12"
          data-test="board-code-reveal"
          @click="loadCode"
        >
          Show tonight's code
        </UButton>
      </NightBlock>
    </div>

    <template #actions>
      <NightAction
        label="Reset the board"
        icon="i-lucide-radio"
        color="error"
        :loading="resetting"
        data-test="board-reset-open"
        @press="confirmingReset = true"
      />
    </template>

    <UModal
      v-model:open="confirmingReset"
      title="Reset the backstage board?"
      description="Every joined device is disconnected immediately. The new code does not appear here: read it out loud."
    >
      <template #body>
        <UAlert
          v-if="resetFailure"
          data-test="board-reset-failure"
          color="error"
          variant="subtle"
          :description="resetFailure"
        />
      </template>

      <template #footer>
        <UButton
          color="error"
          :loading="resetting"
          data-test="board-reset-confirm"
          @click="reset"
        >
          Reset it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="confirmingReset = false"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </NightScreen>
</template>
