/**
 * The one button that must work with no signal: the payload is cached locally
 * on every successful load and rendered from cache when the fetch fails.
 */
<script setup lang="ts">
definePageMeta({
  layout: 'foh',
  middleware: ['foh'],
  title: 'Emergency',
})

interface EmergencyCard {
  venueName: string
  venueAddress: string | null
  addressForEmergencyCall: string | null
  what3words: string | null
  evacuationProcedure: string | null
  assemblyPoint: string | null
  firstAidLocation: string | null
  defibrillatorLocation: string | null
  isolationPoints: string | null
  firePanelLocation: string | null
}

const CACHE_KEY = 'nnt-foh-emergency'

const { performance, performances } = await useFohTonight()
const requestFetch = useRequestFetch()
const fromCache = ref(false)

/**
 * Fetched on the server so the page has content in its first byte, then
 * mirrored to the device so it survives a foyer with no signal.
 */
const { data: fetched } = await useAsyncData(
  'foh-emergency',
  () => (performance.value
    ? requestFetch<EmergencyCard | null>('/api/foh/emergency', { query: { performanceId: performance.value.id } })
    : Promise.resolve(null)),
  { watch: [performance] },
)

const cached = ref<EmergencyCard | null>(null)
const card = computed<EmergencyCard | null>(() => fetched.value ?? cached.value)

onMounted(() => {
  if (fetched.value) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(fetched.value))
    }
    catch {
      // A device refusing storage still has the copy it just fetched.
    }
    return
  }
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return
    cached.value = JSON.parse(raw) as EmergencyCard
    fromCache.value = true
  }
  catch {
    // Nothing saved, or unreadable. The page says so below.
  }
})

const blocks = computed(() => [
  { label: 'Assembly point', value: card.value?.assemblyPoint },
  { label: 'Evacuation', value: card.value?.evacuationProcedure },
  { label: 'First aid kit', value: card.value?.firstAidLocation },
  { label: 'Defibrillator', value: card.value?.defibrillatorLocation },
  { label: 'Fire panel', value: card.value?.firePanelLocation },
  { label: 'Isolation points', value: card.value?.isolationPoints },
].filter(block => block.value))
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100">
    <div class="mx-auto max-w-2xl px-4 py-6">
      <header class="mb-5 flex items-baseline justify-between gap-3">
        <h1 class="text-xl font-semibold">
          Emergency
        </h1>
        <NuxtLink
          to="/foh"
          class="text-sm text-neutral-400 underline underline-offset-4"
        >
          Back
        </NuxtLink>
      </header>

      <p
        v-if="fromCache"
        class="mb-4 rounded-lg bg-amber-950/60 p-3 text-sm text-amber-200"
      >
        Showing the last saved copy. It may be out of date.
      </p>

      <div
        v-if="!performance && performances.length > 1"
        class="mb-4 space-y-2"
      >
        <p class="text-sm text-neutral-400">
          Which performance?
        </p>
        <NuxtLink
          v-for="option in performances"
          :key="option.id"
          :to="{ path: '/foh/emergency', query: { performance: option.id } }"
          class="block rounded-xl border border-neutral-800 bg-neutral-900 p-4"
        >
          {{ option.showTitle }} · {{ option.venueName }}
        </NuxtLink>
      </div>

      <template v-else-if="card">
        <!-- Read aloud to a 999 handler, so it is the biggest thing here. -->
        <section class="mb-4 rounded-xl border-2 border-red-600 bg-red-950/40 p-5">
          <p class="text-xs uppercase tracking-widest text-red-300">
            Read this to 999
          </p>
          <p class="mt-2 text-2xl font-bold leading-snug">
            {{ card.addressForEmergencyCall ?? card.venueAddress ?? card.venueName }}
          </p>
          <p
            v-if="card.what3words"
            class="mt-2 font-mono text-lg text-red-200"
          >
            ///{{ card.what3words.replace(/^\/+/, '') }}
          </p>
          <a
            href="tel:999"
            class="mt-4 block rounded-lg bg-red-600 py-3 text-center text-lg font-semibold text-white"
          >
            Call 999
          </a>
        </section>

        <section
          v-for="block in blocks"
          :key="block.label"
          class="mb-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4"
        >
          <p class="text-xs uppercase tracking-widest text-neutral-400">
            {{ block.label }}
          </p>
          <p class="mt-1 whitespace-pre-line text-lg leading-snug">
            {{ block.value }}
          </p>
        </section>

        <p
          v-if="!blocks.length"
          class="rounded-xl bg-neutral-900 p-4 text-sm text-neutral-400"
        >
          No emergency details have been recorded for {{ card.venueName }} yet. A manager can add
          them under Admin → Front of house.
        </p>
      </template>

      <p
        v-else
        class="rounded-xl bg-neutral-900 p-4 text-sm text-neutral-400"
      >
        Nothing recorded yet, and no saved copy on this device.
      </p>
    </div>
  </div>
</template>
