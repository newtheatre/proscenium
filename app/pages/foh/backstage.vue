/**
 * The front-of-house side of backstage: tonight's code, who has joined with
 * it, and the kill switch. The board itself is the backstage page (docs/11 §2.4).
 */
<script setup lang="ts">
definePageMeta({
  layout: false,
  middleware: ['foh'],
  title: 'Backstage',
})

interface Device { id: string, deviceName: string | null, joinedAt: string, lastSeenAt: string }
interface BackstageView {
  night: string
  code: string
  joinUrl: string
  joinQr: string
  expiresAt: string
  devices: Device[]
}

const requestFetch = useRequestFetch()
const { data, refresh } = await useAsyncData('foh-backstage', () => requestFetch<BackstageView>('/api/foh/backstage'))

interface Message {
  id: string
  direction: 'FOH' | 'BACKSTAGE'
  label: string
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  createdAt: string
}
interface Preset { id: string, label: string, milestone: string | null }

// Server-rendered first, then polled: the duty manager's screen should show
// the current calls in its first paint, not after hydration (ADR-0013).
const { data: initialBoard } = await useAsyncData('foh-backstage-board', () =>
  requestFetch<{ messages: Message[], presets: Preset[] }>('/api/foh/backstage/board').catch(() => null))

const messages = ref<Message[]>(initialBoard.value?.messages ?? [])
const presets = ref<Preset[]>(initialBoard.value?.presets ?? [])
const sending = ref(false)
const text = ref('')

const at = (m: Message) => new Date(m.createdAt).getTime()
const ordered = computed(() => [...messages.value].sort((a, b) => at(b) - at(a)))
const unacked = computed(() => messages.value.filter(m => m.direction === 'BACKSTAGE' && !m.acknowledgedAt))
const latestOurs = computed(() => ordered.value.find(m => m.direction === 'FOH') ?? null)

async function loadBoard() {
  try {
    const board = await requestFetch<{ messages: Message[], presets: Preset[] }>('/api/foh/backstage/board')
    messages.value = board.messages
    presets.value = board.presets
  }
  catch {
    // The code and the device list still matter if the board fails.
  }
}

async function call(presetId?: string) {
  const body = presetId ? undefined : text.value.trim()
  if (!presetId && !body) return
  sending.value = true
  try {
    await requestFetch('/api/foh/backstage/messages', { method: 'POST', body: { presetId, body } })
    text.value = ''
    await loadBoard()
  }
  finally {
    sending.value = false
  }
}

async function acknowledge(message: Message) {
  await requestFetch(`/api/foh/backstage/messages/${message.id}/ack`, { method: 'POST' })
  await loadBoard()
}

let boardTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  boardTimer = setInterval(loadBoard, 2500)
})
onBeforeUnmount(() => {
  if (boardTimer) clearInterval(boardTimer)
})

const resetting = ref(false)
const confirming = ref(false)
const toast = useToast()

/** Grouped, because it gets read aloud over a headset. */
const grouped = computed(() => {
  const code = data.value?.code ?? ''
  return code ? `${code.slice(0, 3)} ${code.slice(3)}` : ''
})

async function reset() {
  resetting.value = true
  try {
    await requestFetch('/api/foh/backstage/reset', { method: 'POST' })
    await refresh()
    confirming.value = false
    toast.add({ title: 'Code reset. Every device is out.', color: 'success' })
  }
  catch {
    toast.add({ title: 'That did not reset', color: 'error' })
  }
  finally {
    resetting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100">
    <div class="mx-auto max-w-2xl px-4 py-6">
      <header class="mb-5 flex items-baseline justify-between gap-3">
        <h1 class="text-xl font-semibold">
          Backstage
        </h1>
        <NuxtLink
          to="/foh"
          class="text-sm text-neutral-400 underline underline-offset-4"
        >
          Back
        </NuxtLink>
      </header>

      <template v-if="data">
        <section class="mb-4 rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-center">
          <p class="text-xs uppercase tracking-widest text-neutral-400">
            Tonight's code
          </p>
          <p class="my-3 font-mono text-5xl font-bold tracking-widest">
            {{ grouped }}
          </p>
          <img
            :src="data.joinQr"
            alt=""
            width="180"
            height="180"
            class="mx-auto rounded-lg bg-white p-2"
          >
          <p class="mt-3 text-sm text-neutral-400">
            Give this to the stage manager at the half. Do not write it anywhere that leaves the
            building: it changes tomorrow.
          </p>
        </section>

        <section class="mb-4">
          <h2 class="mb-2 text-xs uppercase tracking-widest text-neutral-400">
            Call backstage
          </h2>

          <button
            v-for="message in unacked"
            :key="message.id"
            type="button"
            class="mb-2 w-full rounded-xl bg-emerald-700 p-4 text-left text-white"
            @click="acknowledge(message)"
          >
            <span class="block text-xs uppercase tracking-widest text-emerald-200">
              Backstage · {{ formatTime(message.createdAt) }}
            </span>
            <span class="mt-1 block text-2xl font-bold leading-tight">{{ message.label }}</span>
            <span class="mt-2 block text-sm text-emerald-100">Tap to acknowledge</span>
          </button>

          <div class="grid grid-cols-2 gap-2">
            <UButton
              v-for="preset in presets"
              :key="preset.id"
              size="lg"
              variant="soft"
              :disabled="sending"
              :label="preset.label"
              @click="call(preset.id)"
            />
          </div>
          <form
            class="mt-2 flex gap-2"
            @submit.prevent="call()"
          >
            <UInput
              v-model="text"
              placeholder="Anything else"
              class="flex-1"
            />
            <UButton
              type="submit"
              :loading="sending"
              label="Send"
            />
          </form>

          <p
            v-if="latestOurs"
            class="mt-2 text-sm text-neutral-400"
          >
            Last call: {{ latestOurs.label }} ·
            {{ latestOurs.acknowledgedAt ? `seen by ${latestOurs.acknowledgedBy}` : 'not yet seen backstage' }}
          </p>

          <ul class="mt-3 space-y-1">
            <li
              v-for="message in ordered.slice(0, 12)"
              :key="message.id"
              class="flex items-baseline justify-between gap-3 rounded-lg bg-neutral-900 px-3 py-2 text-sm"
            >
              <span>
                <span :class="message.direction === 'FOH' ? 'text-neutral-300' : 'text-emerald-300'">
                  {{ message.direction === 'FOH' ? 'Us' : 'Backstage' }}
                </span>
                · {{ message.label }}
              </span>
              <span class="shrink-0 text-xs text-neutral-500">
                {{ formatTime(message.createdAt) }}<template v-if="message.acknowledgedAt"> ✓</template>
              </span>
            </li>
          </ul>
        </section>

        <section class="mb-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 class="mb-2 text-xs uppercase tracking-widest text-neutral-400">
            Joined devices ({{ data.devices.length }})
          </h2>
          <!-- Counting these against the room is the control that makes a
               shared code honest (ADR-0020). -->
          <p class="mb-3 text-sm text-neutral-400">
            Count these against the devices you can actually see. A number you cannot account for is
            what the reset below is for.
          </p>
          <ul
            v-if="data.devices.length"
            class="divide-y divide-neutral-800"
          >
            <li
              v-for="device in data.devices"
              :key="device.id"
              class="flex justify-between py-2 text-sm"
            >
              <span>{{ device.deviceName ?? 'Unnamed device' }}</span>
              <span class="text-neutral-400">
                joined {{ formatTime(device.joinedAt) }} · seen {{ formatTime(device.lastSeenAt) }}
              </span>
            </li>
          </ul>
          <p
            v-else
            class="text-sm text-neutral-400"
          >
            Nobody has joined yet.
          </p>
        </section>

        <section class="rounded-xl border border-red-900 bg-red-950/30 p-4">
          <h2 class="text-sm font-medium">
            Reset the code
          </h2>
          <p class="mt-1 text-sm text-neutral-300">
            Every joined device is signed out immediately and a new code appears. Use it if a device
            is lost, a message looks wrong, or the count above is off. It is logged and emailed, so
            use it freely.
          </p>
          <div
            v-if="confirming"
            class="mt-3 flex gap-2"
          >
            <UButton
              color="error"
              :loading="resetting"
              label="Yes, reset it"
              @click="reset"
            />
            <UButton
              variant="ghost"
              label="Cancel"
              @click="confirming = false"
            />
          </div>
          <UButton
            v-else
            class="mt-3"
            color="error"
            variant="subtle"
            label="Reset code"
            @click="confirming = true"
          />
        </section>
      </template>
    </div>
  </div>
</template>
