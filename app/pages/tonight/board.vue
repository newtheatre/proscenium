<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'

definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Backstage board' })

interface Message {
  id: string
  posterLabel: string
  milestoneLabel: string | null
  body: string
  supersedesId: string | null
  composedAt: number
}
interface Acknowledgement { messageId: string, deviceId: string }

// Cast to a plain function type before calling: matching the route against Nitro's typed route
// map to infer a return type grows too deep for tsc once enough routes exist (TS2589).
const request = useRequestFetch() as unknown as (route: string) => Promise<{ messages: Message[], acknowledgements: Acknowledgement[] }>
const post = $fetch as unknown as (route: string, options: { method: 'POST' }) => Promise<unknown>
const toast = useToast()

const messages = ref<Message[]>([])
const acknowledgements = ref<Acknowledgement[]>([])
const syncedAt = ref<Date | null>(null)
const busy = ref(true)
const failure = ref<string | null>(null)

async function load(): Promise<void> {
  try {
    const answered = await request('/api/tonight/board/messages')
    messages.value = answered.messages
    acknowledgements.value = answered.acknowledgements
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

const POLL_MS = 5_000
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  load()
  timer = setInterval(load, POLL_MS)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function ackCount(messageId: string): number {
  return acknowledgements.value.filter(ack => ack.messageId === messageId).length
}

// Only the latest event in a supersede chain is shown: a corrected milestone reads as itself,
// not as two rows (E-121 criterion 5).
const current = computed(() => {
  const superseded = new Set(messages.value.map(message => message.supersedesId).filter((id): id is string => id !== null))
  return messages.value.filter(message => !superseded.has(message.id))
})

function timeOf(at: number): string {
  return formatLondon(new Date(at * 1000), { timeStyle: 'short' })
}

const resetting = ref(false)
const resetFailure = ref<string | null>(null)
const confirmingReset = ref(false)

async function reset(): Promise<void> {
  resetting.value = true
  resetFailure.value = null
  try {
    await post('/api/tonight/board/reset', { method: 'POST' })
    confirmingReset.value = false
    toast.add({ title: 'Board reset', description: 'Every device was disconnected. Read the new code out loud.', icon: 'i-lucide-check', color: 'success' })
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
    title="Backstage board"
    hint="What crew are seeing, live. Reset disconnects everyone and changes the code."
    :stale="syncedAt"
    :busy="busy"
  >
    <UAlert
      v-if="failure"
      data-test="board-failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <div
      v-else
      class="space-y-3"
      data-test="board-messages"
    >
      <p
        v-if="current.length === 0"
        class="text-sm text-muted"
      >
        Nothing posted yet.
      </p>
      <div
        v-for="message in current"
        :key="message.id"
        class="rounded-lg border border-default p-3"
        :data-test="`board-message-${message.id}`"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-semibold">
            {{ message.milestoneLabel ? message.milestoneLabel : message.body }}
          </span>
          <span class="text-xs text-muted">{{ timeOf(message.composedAt) }}</span>
        </div>
        <p class="text-xs text-muted">
          {{ message.posterLabel }}
          <template v-if="message.milestoneLabel">
            · {{ message.body }}
          </template>
          · {{ ackCount(message.id) }} acknowledged
        </p>
      </div>
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
