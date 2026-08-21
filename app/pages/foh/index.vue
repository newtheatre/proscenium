/**
 * The show night screen: six buttons, one tap each, readable at arm's length
 * in a dark foyer. Scoped by tonight's rota (ADR-0019). Design: docs/11 §2.
 */
<script setup lang="ts">
definePageMeta({
  layout: false,
  middleware: ['foh'],
  title: 'Front of House',
})

interface FohPerformance {
  id: string
  startsAt: string
  doorsAt: string | null
  showTitle: string
  showSlug: string
  venueName: string
  shiftRole: 'DUTY_MANAGER' | 'DOOR' | 'BAR' | null
}

interface FohScope {
  night: string
  performances: FohPerformance[]
  bypassedRota: boolean
  rosteredOnNothing: boolean
}

const ROLE_LABELS: Record<NonNullable<FohPerformance['shiftRole']>, string> = {
  DUTY_MANAGER: 'Duty manager',
  DOOR: 'Door',
  BAR: 'Bar',
}

const requestFetch = useRequestFetch()
const { data, status } = await useAsyncData('foh-tonight', () => requestFetch<FohScope>('/api/foh/tonight'))

/** Always an array, never null (ADR-0012). */
const performances = computed<FohPerformance[]>(() => data.value?.performances ?? [])
const selectedId = ref<string | null>(null)
watchEffect(() => {
  if (!selectedId.value && performances.value.length === 1) selectedId.value = performances.value[0]!.id
})
const selected = computed(() => performances.value.find(p => p.id === selectedId.value) ?? null)

/**
 * The six from docs/11 §2, in that order. Each lands in its own change; a tile
 * with no route says so rather than going missing.
 */
const buttons = computed(() => [
  { key: 'scan', label: 'Scan ticket', icon: 'i-lucide-scan-line', to: '/foh/scan', note: '' },
  { key: 'tonight', label: 'Tonight at a glance', icon: 'i-lucide-gauge', to: '/foh/tonight', note: '' },
  { key: 'pass', label: 'Admit pass holder', icon: 'i-lucide-credit-card', to: null, note: 'Passes coming 26/27' },
  { key: 'backstage', label: 'Backstage', icon: 'i-lucide-message-square', to: '/foh/backstage', note: '' },
  { key: 'emergency', label: 'Emergency', icon: 'i-lucide-triangle-alert', to: '/foh/emergency', note: '' },
  { key: 'contacts', label: 'Contacts & incidents', icon: 'i-lucide-phone', to: '/foh/contacts', note: '' },
])
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100">
    <div class="mx-auto max-w-2xl px-4 py-6">
      <header class="mb-6 flex items-baseline justify-between gap-3">
        <h1 class="text-xl font-semibold tracking-tight">
          Front of House
        </h1>
        <NuxtLink
          to="/"
          class="text-sm text-neutral-400 underline underline-offset-4"
        >
          Leave
        </NuxtLink>
      </header>

      <div
        v-if="status === 'pending'"
        class="rounded-xl bg-neutral-900 p-6 text-neutral-400"
      >
        Checking tonight's rota…
      </div>

      <!-- Rostered on nothing is a normal state, not an error (ADR-0019). -->
      <div
        v-else-if="!performances.length"
        class="rounded-xl border border-neutral-800 bg-neutral-900 p-6"
      >
        <p class="text-lg font-medium">
          You're not on tonight.
        </p>
        <p class="mt-2 text-sm text-neutral-400">
          <template v-if="data?.rosteredOnNothing">
            This screen lights up for the performances you're confirmed on. If that's wrong, the duty
            manager or the front-of-house manager can put you on the rota.
          </template>
          <template v-else>
            There are no performances scheduled tonight.
          </template>
        </p>
      </div>

      <template v-else>
        <!-- Performance picker, only when there is a choice (docs/11 §2.2). -->
        <div
          v-if="performances.length > 1"
          class="mb-4 space-y-2"
        >
          <p class="text-sm text-neutral-400">
            More than one show tonight. Which are you working?
          </p>
          <button
            v-for="performance in performances"
            :key="performance.id"
            type="button"
            class="w-full rounded-xl border p-4 text-left transition"
            :class="performance.id === selectedId
              ? 'border-violet-500 bg-violet-950/40'
              : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700'"
            @click="selectedId = performance.id"
          >
            <span class="block font-medium">{{ performance.showTitle }}</span>
            <span class="block text-sm text-neutral-400">
              {{ formatTime(performance.startsAt) }} · {{ performance.venueName }}
              <template v-if="performance.shiftRole"> · {{ ROLE_LABELS[performance.shiftRole] }}</template>
            </span>
          </button>
        </div>

        <div
          v-if="selected"
          class="mb-6 rounded-xl border border-neutral-800 bg-neutral-900 p-4"
        >
          <p class="text-lg font-semibold">
            {{ selected.showTitle }}
          </p>
          <p class="mt-1 text-sm text-neutral-400">
            {{ formatTime(selected.startsAt) }} · {{ selected.venueName }}
            <template v-if="selected.doorsAt">
              · doors {{ formatTime(selected.doorsAt) }}
            </template>
          </p>
          <p class="mt-2 text-sm">
            <span
              v-if="selected.shiftRole"
              class="rounded-full bg-violet-900/60 px-3 py-1 text-violet-200"
            >
              You're on {{ ROLE_LABELS[selected.shiftRole].toLowerCase() }}
            </span>
            <span
              v-else
              class="rounded-full bg-neutral-800 px-3 py-1 text-neutral-300"
            >
              Box office access
            </span>
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <component
            :is="button.to ? 'NuxtLink' : 'div'"
            v-for="button in buttons"
            :key="button.key"
            :to="button.to ?? undefined"
            class="flex min-h-32 flex-col justify-between rounded-xl border p-4"
            :class="button.to
              ? 'border-neutral-700 bg-neutral-900 hover:border-violet-600'
              : 'cursor-not-allowed border-neutral-900 bg-neutral-900/40 text-neutral-500'"
          >
            <UIcon
              :name="button.icon"
              class="size-7"
            />
            <span>
              <span class="block text-base font-medium leading-tight">{{ button.label }}</span>
              <span
                v-if="!button.to"
                class="mt-1 block text-xs"
              >{{ button.note }}</span>
            </span>
          </component>
        </div>
      </template>
    </div>
  </div>
</template>
