/**
 * Tonight at a glance: can we take walk-ups, and what does the door get asked.
 * Pass pressure, access needs and Close the night land later (docs/11 §2.2).
 */
<script setup lang="ts">
definePageMeta({
  layout: false,
  middleware: ['foh'],
  title: 'Tonight at a glance',
})

interface Glance {
  numbers: { sold: number, collected: number, capacity: number | null, remaining: number | null }
  show: {
    title: string
    durationMinutes: number | null
    intervalCount: number
    intervalMinutes: number | null
    ageGuidance: string | null
    latecomerPolicy: string | null
    contentWarningNotes: string | null
    warningsConfirmedNone: boolean
    warnings: Array<{ title: string, level: string | null }>
  }
}

const { performance, performances } = await useFohTonight()
const requestFetch = useRequestFetch()

const { data } = await useAsyncData(
  'foh-glance',
  () => (performance.value
    ? requestFetch<Glance>('/api/foh/glance', { query: { performanceId: performance.value.id } })
    : Promise.resolve(null)),
  { watch: [performance] },
)

const numbers = computed(() => data.value?.numbers ?? null)
const show = computed(() => data.value?.show ?? null)

const runningTime = computed(() => {
  const s = show.value
  if (!s?.durationMinutes) return null
  const interval = s.intervalCount > 0
    ? `, with ${s.intervalCount === 1 ? 'an interval' : `${s.intervalCount} intervals`}${s.intervalMinutes ? ` of ${s.intervalMinutes} minutes` : ''}`
    : ', straight through'
  return `${s.durationMinutes} minutes${interval}`
})

const facts = computed(() => [
  { label: 'Running time', value: runningTime.value },
  { label: 'Age guidance', value: show.value?.ageGuidance },
  { label: 'Latecomers', value: show.value?.latecomerPolicy },
].filter(fact => fact.value))
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100">
    <div class="mx-auto max-w-2xl px-4 py-6">
      <header class="mb-5 flex items-baseline justify-between gap-3">
        <h1 class="text-xl font-semibold">
          Tonight at a glance
        </h1>
        <NuxtLink
          to="/foh"
          class="text-sm text-neutral-400 underline underline-offset-4"
        >
          Back
        </NuxtLink>
      </header>

      <div
        v-if="!performance && performances.length > 1"
        class="space-y-2"
      >
        <p class="text-sm text-neutral-400">
          Which performance?
        </p>
        <NuxtLink
          v-for="option in performances"
          :key="option.id"
          :to="{ path: '/foh/tonight', query: { performance: option.id } }"
          class="block rounded-xl border border-neutral-800 bg-neutral-900 p-4"
        >
          {{ option.showTitle }} · {{ option.venueName }}
        </NuxtLink>
      </div>

      <template v-else-if="numbers && show">
        <section class="mb-5 grid grid-cols-3 gap-3">
          <div class="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-center">
            <p class="text-3xl font-bold">
              {{ numbers.sold }}
            </p>
            <p class="text-xs uppercase tracking-widest text-neutral-400">
              Sold
            </p>
          </div>
          <div class="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-center">
            <p class="text-3xl font-bold">
              {{ numbers.collected }}
            </p>
            <p class="text-xs uppercase tracking-widest text-neutral-400">
              In
            </p>
          </div>
          <div
            class="rounded-xl border p-4 text-center"
            :class="numbers.remaining === 0
              ? 'border-amber-600 bg-amber-950/40'
              : 'border-neutral-800 bg-neutral-900'"
          >
            <p class="text-3xl font-bold">
              {{ numbers.remaining === null ? '∞' : numbers.remaining }}
            </p>
            <p class="text-xs uppercase tracking-widest text-neutral-400">
              Seats left
            </p>
          </div>
        </section>

        <p class="mb-6 text-sm text-neutral-400">
          <template v-if="numbers.remaining === null">
            This performance has no capacity set, so walk-ups are a judgement call.
          </template>
          <template v-else-if="numbers.remaining === 0">
            Full. No walk-ups without releasing no-shows first.
          </template>
          <template v-else>
            Room for {{ numbers.remaining }} more, so walk-ups are fine.
          </template>
        </p>

        <section class="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 class="mb-3 text-xs uppercase tracking-widest text-neutral-400">
            What people ask
          </h2>

          <div
            v-for="fact in facts"
            :key="fact.label"
            class="mb-3"
          >
            <p class="text-xs uppercase tracking-widest text-neutral-500">
              {{ fact.label }}
            </p>
            <p class="text-base">
              {{ fact.value }}
            </p>
          </div>

          <div class="mb-1">
            <p class="text-xs uppercase tracking-widest text-neutral-500">
              Content warnings
            </p>
            <div
              v-if="show.warnings.length"
              class="mt-1 flex flex-wrap gap-2"
            >
              <span
                v-for="warning in show.warnings"
                :key="warning.title"
                class="rounded-full bg-neutral-800 px-3 py-1 text-sm"
              >
                {{ warning.title }}
                <span
                  v-if="warning.level"
                  class="text-neutral-400"
                >({{ warning.level.toLowerCase() }})</span>
              </span>
            </div>
            <p
              v-else-if="show.warningsConfirmedNone"
              class="text-base"
            >
              None: confirmed by the production.
            </p>
            <p
              v-else
              class="text-base text-neutral-400"
            >
              Not recorded. Say so rather than guessing.
            </p>
            <p
              v-if="show.contentWarningNotes"
              class="mt-2 whitespace-pre-line text-sm text-neutral-300"
            >
              {{ show.contentWarningNotes }}
            </p>
          </div>
        </section>

        <p class="mt-6 text-center text-xs text-neutral-500">
          Pass pressure, access needs and closing the night arrive with their own builds.
        </p>
      </template>
    </div>
  </div>
</template>
