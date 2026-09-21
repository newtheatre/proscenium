<script setup lang="ts">
import { saysQueuedSend } from '#shared/utils/backstage'
import { groupedBoardCode } from '#shared/utils/night-hub'
import type { BoardSide } from '#shared/utils/backstage'

definePageMeta({ layout: 'tonight', docs: '/docs/show-night/backstage-board' })
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

// The queue never revisits its own decision, so trying again is a fresh send carrying the same
// words, and the refused row leaves the list either way (K-104).
function sendAgain(id: string, payload: QueuedMessage): void {
  writeQueue.dismiss(id)
  writeQueue.enqueue(payload.presetId ? 'preset' : 'free-text', payload)
}

function sendFreeText(): void {
  const body = freeText.value.trim()
  if (!body) return
  writeQueue.enqueue('free-text', { presetId: null, body })
  freeText.value = ''
}

const seenFailure = ref<string | null>(null)

// A tick that did not record must say so: the other end reads "seen" off this, and a silent
// failure leaves both ends believing a call was acknowledged (E-121 criterion 4).
async function markSeen(messageId: string): Promise<void> {
  seenFailure.value = null
  try {
    // @ts-expect-error an options-carrying call has no working generic form yet (0053).
    await $fetch<unknown>('/api/tonight/board/seen', { method: 'POST', body: { messageId } })
    await load()
  }
  catch (error) {
    seenFailure.value = refusalText(error)
  }
}

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

      <UAlert
        v-if="seenFailure"
        data-test="board-seen-failure"
        color="warning"
        variant="subtle"
        :description="seenFailure"
      />

      <BoardFeed
        side="FOH"
        :messages="messages"
        :seen="seen"
      >
        <template #other-unseen="{ message }">
          <UButton
            color="neutral"
            variant="subtle"
            class="ml-1 min-h-12"
            :data-test="`board-seen-${message.id}`"
            @click="markSeen(message.id)"
          >
            Mark seen
          </UButton>
        </template>

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

          <!-- A send the board refused comes back here, in the words it was typed in: a call
               that vanished is a call both ends think was made (E-121 criterion 6). -->
          <ul
            v-if="writeQueue.rejected.value.length"
            class="mt-3 space-y-2"
            data-test="board-rejected"
          >
            <li
              v-for="refused in writeQueue.rejected.value"
              :key="refused.id"
              class="space-y-2 rounded-xl bg-error/10 p-3 ring-1 ring-error/60"
              :data-test="`board-rejected-${refused.id}`"
            >
              <p class="font-semibold">
                {{ saysQueuedSend(presets, refused.payload) }}
              </p>
              <p class="text-sm">
                Not sent. {{ refused.reason }}
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  color="secondary"
                  class="min-h-12"
                  :data-test="`board-rejected-retry-${refused.id}`"
                  @click="sendAgain(refused.id, refused.payload)"
                >
                  Try again
                </UButton>
                <UButton
                  color="neutral"
                  variant="outline"
                  class="min-h-12"
                  :data-test="`board-rejected-discard-${refused.id}`"
                  @click="writeQueue.dismiss(refused.id)"
                >
                  Discard the message
                </UButton>
              </div>
            </li>
          </ul>
        </section>
      </BoardFeed>

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
            color="neutral"
            variant="ghost"
            class="mt-2 min-h-12"
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
      <div class="flex justify-center pt-2">
        <UButton
          color="error"
          variant="outline"
          icon="i-lucide-radio"
          class="min-h-12"
          :loading="resetting"
          data-test="board-reset-open"
          @click="confirmingReset = true"
        >
          Reset the board
        </UButton>
      </div>
    </div>

    <template #actions>
      <!-- The board's own first action is a call, so the composer is what sits under the thumb;
           Reset lives under the list, where a red pinned button cannot be hit by mistake. -->
      <form
        class="flex gap-3"
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
          Reset the board
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
