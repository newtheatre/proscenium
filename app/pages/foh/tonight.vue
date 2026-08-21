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

interface AccessEntry {
  firstName: string
  partySize: number
  needs: string[]
  companions: number
  fohNote: string | null
}

const NEED_LABELS: Record<string, string> = {
  levelAccess: 'Level access',
  difficultyStanding: 'Difficulty standing',
  difficultyWithCrowds: 'Crowds',
  distance: 'Distance',
  urgentToilet: 'Urgent toilet',
  visualInformation: 'Visual info',
  audibleInformation: 'Audible info',
  miscellaneous: 'Other',
}

const { performance, performances, scope } = await useFohTonight()
const requestFetch = useRequestFetch()

interface StoredReport {
  id: string
  night: string
  closedAt: string
  autoClosed: boolean
  closedBy: string | null
}

const toast = useToast()
const closeOpen = ref(false)
const closing = ref(false)
const checklist = reactive({ noShowsReleased: false, incidentsReviewed: false })
const closingNote = ref('')

const { data: reportData, refresh: refreshReport } = await useAsyncData(
  () => `foh-report-${performance.value?.id ?? 'none'}`,
  () => performance.value
    ? requestFetch<{ closed: boolean, report: StoredReport | null }>(`/api/foh/performances/${performance.value.id}/report`)
    : Promise.resolve({ closed: false, report: null }),
  { watch: [performance] },
)

/** Signing the night off is the duty manager's, exactly as approving a comp is. */
const mayClose = computed(() => performance.value?.shiftRole === 'DUTY_MANAGER' || Boolean(scope.value?.bypassedRota))
const closed = computed(() => reportData.value?.report ?? null)

async function closeNight() {
  closing.value = true
  try {
    await requestFetch(`/api/foh/performances/${performance.value!.id}/close`, {
      method: 'POST',
      body: { checklist: { ...checklist }, closingNote: closingNote.value || null },
    })
    closeOpen.value = false
    await refreshReport()
    toast.add({ title: 'Night closed and filed', icon: 'i-lucide-check', color: 'success' })
  }
  catch (error) {
    toast.add({
      title: 'Not closed',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
      color: 'error',
    })
  }
  finally {
    closing.value = false
  }
}

/** Only the duty manager sees a queue; the till is where it is answered. */
const pendingComps = ref(0)
async function pollComps() {
  try {
    const res = await requestFetch<{ mayApprove: boolean, awaitingApproval: unknown[] }>('/api/bar/comps')
    pendingComps.value = res.mayApprove ? res.awaitingApproval.length : 0
  }
  catch {
    // Not everyone working tonight can reach the bar: a 403 here is expected.
  }
}

let compTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  pollComps()
  compTimer = setInterval(pollComps, 8000)
})
onBeforeUnmount(() => {
  if (compTimer) clearInterval(compTimer)
})

const { data } = await useAsyncData(
  'foh-glance',
  () => (performance.value
    ? requestFetch<Glance>('/api/foh/glance', { query: { performanceId: performance.value.id } })
    : Promise.resolve(null)),
  { watch: [performance] },
)

const { data: accessData } = await useAsyncData(
  'foh-access-tonight',
  () => (performance.value
    ? requestFetch<AccessEntry[]>('/api/foh/access-tonight', { query: { performanceId: performance.value.id } })
    : Promise.resolve([])),
  { watch: [performance] },
)

/** Empty when the rule does not admit you, which the screen simply does not show. */
const access = computed<AccessEntry[]>(() => accessData.value ?? [])

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
        v-if="closed"
        class="mb-5 rounded-xl border border-neutral-800 bg-neutral-900 p-4"
      >
        <p class="text-sm font-medium text-neutral-200">
          Night closed
          <span
            v-if="closed.autoClosed"
            class="text-amber-400"
          >&mdash; auto-closed, no duty manager sign-off</span>
          <span
            v-else-if="closed.closedBy"
            class="text-neutral-400"
          >by {{ closed.closedBy }}</span>
        </p>
        <p class="text-xs text-neutral-500">
          {{ formatDateTime(closed.closedAt) }} &middot; the report has been filed and emailed.
        </p>
      </div>

      <UButton
        v-else-if="mayClose && performance"
        block
        size="lg"
        color="primary"
        class="mb-5"
        icon="i-lucide-clipboard-check"
        label="Close the night"
        @click="closeOpen = true"
      />

      <NuxtLink
        v-if="pendingComps"
        to="/foh/bar/till"
        class="mb-5 flex items-center justify-between rounded-xl border border-amber-500/50 bg-amber-500/10 p-4"
      >
        <span class="text-sm font-medium text-amber-300">
          {{ pendingComps }} comp{{ pendingComps === 1 ? '' : 's' }} awaiting approval
        </span>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-5 text-amber-300"
        />
      </NuxtLink>

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

        <!-- Consented needs only, and only for the people working tonight
             (ADR-0022). Absent entirely when the rule does not admit you. -->
        <section
          v-if="access.length"
          class="mb-4 rounded-xl border border-violet-800 bg-violet-950/30 p-4"
        >
          <h2 class="mb-1 text-xs uppercase tracking-widest text-violet-300">
            Access tonight
          </h2>
          <p class="mb-3 text-xs text-neutral-400">
            Shared with you because you are working this performance. Do not pass it on.
          </p>
          <article
            v-for="entry in access"
            :key="entry.firstName"
            class="mb-2 rounded-lg bg-neutral-900/80 p-3"
          >
            <p class="font-medium">
              {{ entry.firstName }}
              <span class="text-sm font-normal text-neutral-400">
                · party of {{ entry.partySize }}
                <template v-if="entry.companions">
                  · +{{ entry.companions }} companion
                </template>
              </span>
            </p>
            <div
              v-if="entry.needs.length"
              class="mt-2 flex flex-wrap gap-1"
            >
              <span
                v-for="need in entry.needs"
                :key="need"
                class="rounded-full bg-violet-900/70 px-2 py-0.5 text-xs text-violet-100"
              >
                {{ NEED_LABELS[need] ?? need }}
              </span>
            </div>
            <p
              v-if="entry.fohNote"
              class="mt-2 text-sm text-neutral-300"
            >
              {{ entry.fohNote }}
            </p>
          </article>
        </section>

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

    <UModal
      v-model:open="closeOpen"
      title="Close the night"
    >
      <template #body>
        <div class="space-y-4">
          <UCheckbox
            v-model="checklist.noShowsReleased"
            label="No-shows released"
          />
          <UCheckbox
            v-model="checklist.incidentsReviewed"
            label="Incidents reviewed"
          />
          <UFormField
            label="Anything to add"
            help="This goes in the report, which is the record."
          >
            <UTextarea
              v-model="closingNote"
              :rows="4"
              class="w-full"
            />
          </UFormField>
          <UAlert
            icon="i-lucide-info"
            color="neutral"
            variant="subtle"
            title="Closing ends the backstage codes"
            description="Every backstage session for tonight stops working, and the report is filed and emailed."
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Not yet"
            @click="closeOpen = false"
          />
          <UButton
            :loading="closing"
            label="Close the night"
            @click="closeNight"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
