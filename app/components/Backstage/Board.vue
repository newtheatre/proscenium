/**
 * The backstage display: the board, the house count, and three verbs. Polled
 * with a cursor (ADR-0021); dims itself once the show starts (docs/11 §5.4).
 */
<script setup lang="ts">
interface Message {
  id: string
  direction: 'FOH' | 'BACKSTAGE'
  label: string
  body: string | null
  milestone: string | null
  senderName: string | null
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  createdAt: string
}
interface Preset { id: string, label: string, milestone: string | null }
interface House { admitted: number, expected: number, showTitle: string | null, startsAt: string | null, intervalCount: number }

const STALE_AFTER_MS = 30_000

interface BoardData { messages: Message[], presets: Preset[], house: House }

// The first load is server-rendered so a resident display shows state in its
// first paint; polling takes over after that (ADR-0013 for the fetch choice).
const requestFetch = useRequestFetch()
const { data: initial } = await useAsyncData('backstage-board', () =>
  requestFetch<BoardData>('/api/backstage/board').catch(() => null))

const messages = ref<Message[]>(initial.value?.messages ?? [])
const presets = ref<Preset[]>(initial.value?.presets ?? [])
const house = ref<House | null>(initial.value?.house ?? null)
const cursor = ref(initial.value?.messages.length
  ? Math.max(...initial.value.messages.map(m => new Date(m.createdAt).getTime()))
  : 0)
const lastSuccess = ref(Date.now())
const now = ref(Date.now())
const text = ref('')
const sending = ref(false)

const stale = computed(() => now.value - lastSuccess.value > STALE_AFTER_MS)

function at(message: Message) {
  return new Date(message.createdAt).getTime()
}

/** Once show start is acknowledged the room is dark, so the board goes quiet. */
const performanceMode = computed(() => {
  const started = messages.value.filter(m => m.milestone === 'SHOW_START' && m.acknowledgedAt)
  if (!started.length) return false
  const latestStart = Math.max(...started.map(at))
  return !messages.value.some(m => m.milestone === 'INTERVAL' && at(m) > latestStart)
})

const unacked = computed(() => messages.value.filter(m => m.direction === 'FOH' && !m.acknowledgedAt))
const ordered = computed(() => [...messages.value].sort((a, b) => at(b) - at(a)))
const latestFoh = computed(() => ordered.value.find(m => m.direction === 'FOH') ?? null)
const latestOurs = computed(() => ordered.value.find(m => m.direction === 'BACKSTAGE') ?? null)
const history = computed(() => ordered.value.slice(0, 40))

const toStart = computed(() => {
  if (!house.value?.startsAt) return null
  const diff = new Date(house.value.startsAt).getTime() - now.value
  const minutes = Math.round(Math.abs(diff) / 60000)
  return diff > 0 ? `${minutes} min to advertised start` : `started ${minutes} min ago`
})

/** A short beep rather than an asset: nothing to ship, nothing to 404. */
function chime() {
  if (performanceMode.value) return
  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 880
    gain.gain.value = 0.12
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.18)
  }
  catch {
    // No audio permission or no device. The banner is the real signal.
  }
}

async function poll() {
  try {
    const data = await $fetch<{ messages: Message[], presets: Preset[], house: House }>(
      '/api/backstage/board', { query: cursor.value ? { since: cursor.value } : {} },
    )
    presets.value = data.presets
    house.value = data.house
    lastSuccess.value = Date.now()
    if (!data.messages.length) return

    const known = new Set(messages.value.map(m => m.id))
    const fresh = data.messages.filter(m => !known.has(m.id))
    // Merge rather than append: a cursored poll returns what is new, and a
    // full refresh returns rows we already hold with their acks updated.
    messages.value = [...messages.value.filter(m => !data.messages.some(d => d.id === m.id)), ...data.messages]
    cursor.value = Math.max(cursor.value, ...data.messages.map(at))
    if (fresh.some(m => m.direction === 'FOH')) chime()
  }
  catch {
    // Leave lastSuccess alone; the stale banner is what says so.
  }
}

/** An ack changes a message already held, which a cursor cannot see. */
async function refreshAll() {
  cursor.value = 0
  messages.value = []
  await poll()
}

async function send(presetId?: string) {
  const body = presetId ? undefined : text.value.trim()
  if (!presetId && !body) return
  sending.value = true
  try {
    await $fetch('/api/backstage/messages', { method: 'POST', body: { presetId, body } })
    text.value = ''
    await refreshAll()
  }
  finally {
    sending.value = false
  }
}

async function acknowledge(message: Message) {
  await $fetch(`/api/backstage/messages/${message.id}/ack`, { method: 'POST' })
  await refreshAll()
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  pollTimer = setInterval(poll, 2500)
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  refreshTimer = setInterval(refreshAll, 20_000)
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (clockTimer) clearInterval(clockTimer)
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div :class="performanceMode ? 'opacity-60 transition-opacity duration-1000' : ''">
    <div
      v-if="stale"
      class="mb-3 rounded-lg bg-amber-600 p-3 text-center font-medium text-neutral-950"
    >
      Stale since {{ formatTime(new Date(lastSuccess).toISOString()) }} — this board is not updating.
    </div>

    <!-- Unacked calls take the width and stay until tapped (§5.4). -->
    <button
      v-for="message in unacked"
      :key="message.id"
      type="button"
      class="mb-3 w-full rounded-xl bg-violet-600 p-6 text-left text-white"
      @click="acknowledge(message)"
    >
      <span class="block text-xs uppercase tracking-widest text-violet-200">
        Front of house · {{ formatTime(message.createdAt) }}
      </span>
      <span class="mt-1 block text-3xl font-bold leading-tight">{{ message.label }}</span>
      <span class="mt-3 block text-sm text-violet-100">Tap to acknowledge</span>
    </button>

    <section class="mb-4 grid gap-3 sm:grid-cols-2">
      <div class="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <p class="text-xs uppercase tracking-widest text-neutral-400">
          Last from front of house
        </p>
        <p class="mt-1 text-xl font-semibold">
          {{ latestFoh?.label ?? '—' }}
        </p>
        <p
          v-if="latestFoh"
          class="text-sm text-neutral-400"
        >
          {{ formatTime(latestFoh.createdAt) }} ·
          {{ latestFoh.acknowledgedAt ? 'acknowledged' : 'not yet acknowledged' }}
        </p>
      </div>
      <div class="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <p class="text-xs uppercase tracking-widest text-neutral-400">
          Last from us
        </p>
        <p class="mt-1 text-xl font-semibold">
          {{ latestOurs?.label ?? '—' }}
        </p>
        <p
          v-if="latestOurs"
          class="text-sm text-neutral-400"
        >
          {{ formatTime(latestOurs.createdAt) }} ·
          {{ latestOurs.acknowledgedAt ? `seen by ${latestOurs.acknowledgedBy}` : 'unseen' }}
        </p>
      </div>
    </section>

    <!-- The only box office figure that crosses this line (§5.2). -->
    <section
      v-if="house"
      class="mb-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-center"
    >
      <p class="text-xs uppercase tracking-widest text-neutral-400">
        {{ house.showTitle ?? 'Tonight' }}
      </p>
      <p class="my-1 text-4xl font-bold">
        {{ house.admitted }} <span class="text-neutral-500">/ {{ house.expected }}</span>
      </p>
      <p class="text-sm text-neutral-400">
        in the house<template v-if="toStart">
          · {{ toStart }}
        </template>
        <template v-if="house.intervalCount">
          · {{ house.intervalCount === 1 ? 'one interval' : `${house.intervalCount} intervals` }}
        </template>
      </p>
    </section>

    <section class="mb-4">
      <p class="mb-2 text-xs uppercase tracking-widest text-neutral-400">
        Call through
      </p>
      <div class="grid grid-cols-2 gap-2">
        <UButton
          v-for="preset in presets"
          :key="preset.id"
          size="xl"
          variant="soft"
          :disabled="sending"
          :label="preset.label"
          @click="send(preset.id)"
        />
      </div>
      <form
        class="mt-2 flex gap-2"
        @submit.prevent="send()"
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
    </section>

    <section>
      <p class="mb-2 text-xs uppercase tracking-widest text-neutral-400">
        Tonight
      </p>
      <ul class="space-y-1">
        <li
          v-for="message in history"
          :key="message.id"
          class="flex items-baseline justify-between gap-3 rounded-lg bg-neutral-900 px-3 py-2 text-sm"
        >
          <span>
            <span :class="message.direction === 'FOH' ? 'text-violet-300' : 'text-neutral-300'">
              {{ message.direction === 'FOH' ? 'FOH' : 'Us' }}
            </span>
            · {{ message.label }}
          </span>
          <span class="shrink-0 text-xs text-neutral-500">
            {{ formatTime(message.createdAt) }}<template v-if="message.acknowledgedAt"> ✓</template>
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>
