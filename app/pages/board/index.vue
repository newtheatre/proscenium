<script setup lang="ts">
import { boardJoinForm } from '#shared/utils/backstage'
import { formatLondon } from '#shared/utils/london'

// No account, no personal data: the code and a display label are the whole of the form
// (E-120 criterion 1). A cookie, never the device store, which is `useNightCache`'s alone.
const state = reactive({ code: '', label: '' })
const joining = ref(false)
const failure = ref<string | null>(null)
const joined = ref<{ venueName: string } | null>(null)
const deviceToken = useCookie<string | null>('nnt-backstage-token', { maxAge: 60 * 60 * 24, sameSite: 'lax' })

// Cast to a plain function type before calling: matching the route against Nitro's typed route
// map to check the body shape grows too deep for tsc once enough routes exist (TS2589).
const postJoin = $fetch as unknown as (route: string, options: { method: 'POST', body: unknown }) => Promise<{ token: string, venueName: string }>

async function join(): Promise<void> {
  joining.value = true
  failure.value = null
  try {
    const answered = await postJoin('/api/board/join', {
      method: 'POST',
      body: state,
    })
    deviceToken.value = answered.token
    joined.value = { venueName: answered.venueName }
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    joining.value = false
  }
}

useSeoMeta({ title: 'Backstage board' })

// The board itself, once joined (E-121, E-122).

interface MilestoneType { id: string, label: string }
interface Preset { id: string, label: string, body: string }
interface Message {
  id: string
  posterLabel: string
  milestoneTypeId: string | null
  milestoneLabel: string | null
  body: string
  supersedesId: string | null
  composedAt: number
}
interface Acknowledgement { messageId: string, deviceId: string }

const milestoneTypes = ref<MilestoneType[]>([])
const presets = ref<Preset[]>([])
const messages = ref<Message[]>([])
const acknowledgements = ref<Acknowledgement[]>([])
const boardFailure = ref<string | null>(null)
const freeText = ref('')

const getConfig = $fetch as unknown as (route: string) => Promise<{ milestoneTypes: MilestoneType[], presets: Preset[] }>
const getMessages = $fetch as unknown as (route: string) => Promise<{ messages: Message[], acknowledgements: Acknowledgement[] }>
const postMessage = $fetch as unknown as (route: string, options: { method: 'POST', body: unknown }) => Promise<unknown>
const postAck = $fetch as unknown as (route: string, options: { method: 'POST' }) => Promise<unknown>

async function loadConfig(): Promise<void> {
  try {
    const answered = await getConfig('/api/board/config')
    milestoneTypes.value = answered.milestoneTypes
    presets.value = answered.presets
  }
  catch { /* the buttons below just stay empty; the feed still polls */ }
}

async function loadMessages(): Promise<void> {
  try {
    const answered = await getMessages('/api/board/messages')
    messages.value = answered.messages
    acknowledgements.value = answered.acknowledgements
    boardFailure.value = null
  }
  catch (error) {
    boardFailure.value = refusalText(error)
  }
}

// Within five seconds, the contract this story states directly, not a configuration key
// (criterion 3).
const POLL_MS = 5_000
let timer: ReturnType<typeof setInterval> | undefined

watch(joined, (value) => {
  if (!value) return
  loadConfig()
  loadMessages()
  timer = setInterval(loadMessages, POLL_MS)
}, { immediate: true })

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

interface QueuedMessage { milestoneTypeId: string | null, presetId: string | null, body: string | null }

// A connection hole costs nothing: a tap queues and drains on reconnect, carrying the moment
// it was actually composed rather than the moment it finally sent (criterion 6, K-104).
const writeQueue = useWriteQueue<QueuedMessage>(async (action) => {
  try {
    await postMessage('/api/board/messages', {
      method: 'POST',
      body: { ...action.payload, composedAt: Math.floor(action.queuedAt / 1000) },
    })
    await loadMessages()
    return { ok: true }
  }
  catch (error) {
    const status = refusalStatus(error)
    // A definite refusal (a retired milestone, a malformed body) is not retried; a dropped
    // connection or a server hiccup is.
    if (status !== undefined && status < 500) return { ok: false, retry: false, reason: refusalText(error) }
    return { ok: false, retry: true, reason: refusalText(error) }
  }
})

function postMilestone(id: string): void {
  writeQueue.enqueue('milestone', { milestoneTypeId: id, presetId: null, body: null })
}

function postPreset(id: string): void {
  writeQueue.enqueue('preset', { milestoneTypeId: null, presetId: id, body: null })
}

function postFreeText(): void {
  const body = freeText.value.trim()
  if (!body) return
  writeQueue.enqueue('free-text', { milestoneTypeId: null, presetId: null, body })
  freeText.value = ''
}

async function acknowledge(messageId: string): Promise<void> {
  try {
    await postAck(`/api/board/messages/${messageId}/acknowledge`, { method: 'POST' })
    await loadMessages()
  }
  catch { /* a tap that failed to record is a tap the crew member can try again */ }
}

// Only the latest event in a supersede chain is shown (E-121 criterion 5).
const current = computed(() => {
  const superseded = new Set(messages.value.map(message => message.supersedesId).filter((id): id is string => id !== null))
  return messages.value.filter(message => !superseded.has(message.id))
})

function timeOf(at: number): string {
  return formatLondon(new Date(at * 1000), { timeStyle: 'short' })
}
</script>

<template>
  <UContainer class="max-w-md py-8">
    <UPageCard v-if="!joined">
      <UForm
        :schema="boardJoinForm"
        :state="state"
        class="space-y-4"
        data-test="board-join-form"
        @submit="join"
      >
        <h1 class="nnt-headline text-xl">
          Join tonight's board
        </h1>
        <p class="text-muted">
          Ask the duty manager for tonight's code.
        </p>

        <UAlert
          v-if="failure"
          data-test="board-join-failure"
          color="error"
          variant="subtle"
          :description="failure"
        />

        <UFormField
          label="Code"
          name="code"
        >
          <UInput
            v-model="state.code"
            inputmode="numeric"
            autocomplete="one-time-code"
            class="w-full font-mono text-lg tracking-widest"
            data-test="board-code-input"
          />
        </UFormField>

        <UFormField
          label="Your name or role"
          name="label"
          description="Shown to the duty manager, nothing else. Not validated against anything."
        >
          <UInput
            v-model="state.label"
            class="w-full"
            data-test="board-label-input"
          />
        </UFormField>

        <UButton
          type="submit"
          :loading="joining"
          data-test="board-join-submit"
          block
        >
          Join
        </UButton>
      </UForm>
    </UPageCard>

    <div
      v-else
      data-test="board-joined"
      class="space-y-4"
    >
      <div>
        <h1 class="nnt-headline text-xl">
          {{ joined.venueName }}
        </h1>
        <p
          v-if="writeQueue.connection.value.status === 'offline'"
          data-test="board-offline"
          class="text-sm text-warning"
        >
          {{ writeQueue.connection.value.queued }} message{{ writeQueue.connection.value.queued === 1 ? '' : 's' }} waiting to send.
        </p>
      </div>

      <UAlert
        v-if="boardFailure"
        data-test="board-failure"
        color="error"
        variant="subtle"
        :description="boardFailure"
      />

      <div
        v-if="milestoneTypes.length || presets.length"
        class="grid grid-cols-2 gap-2"
      >
        <UButton
          v-for="type in milestoneTypes"
          :key="type.id"
          color="primary"
          size="lg"
          class="min-h-12"
          :data-test="`milestone-${type.id}`"
          @click="postMilestone(type.id)"
        >
          {{ type.label }}
        </UButton>
        <UButton
          v-for="preset in presets"
          :key="preset.id"
          color="neutral"
          variant="subtle"
          size="lg"
          class="min-h-12"
          :data-test="`preset-${preset.id}`"
          @click="postPreset(preset.id)"
        >
          {{ preset.label }}
        </UButton>
      </div>

      <form
        class="flex gap-2"
        data-test="free-text-form"
        @submit.prevent="postFreeText"
      >
        <UInput
          v-model="freeText"
          placeholder="Say something"
          class="w-full"
          data-test="free-text-input"
        />
        <UButton
          type="submit"
          data-test="free-text-submit"
        >
          Send
        </UButton>
      </form>

      <div class="space-y-2">
        <div
          v-for="message in current"
          :key="message.id"
          class="rounded-lg border border-default p-3"
          :data-test="`message-${message.id}`"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-semibold">{{ message.milestoneLabel ?? message.body }}</span>
            <span class="text-xs text-muted">{{ timeOf(message.composedAt) }}</span>
          </div>
          <p class="text-xs text-muted">
            {{ message.posterLabel }}
          </p>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            class="mt-1"
            :data-test="`acknowledge-${message.id}`"
            @click="acknowledge(message.id)"
          >
            Seen
          </UButton>
        </div>
      </div>
    </div>
  </UContainer>
</template>
