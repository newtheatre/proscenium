<script setup lang="ts">
import { saysNightClosed, saysPhase } from '#shared/utils/checklist'
import { holdsTheClose } from '#shared/utils/night-signoff'
import { saysTillLeftOpen } from '#shared/utils/till'
import type { ChecklistClose, ChecklistEntry, Phase, TonightChecklist } from '#shared/utils/checklist'
import type { TillLeftOpen } from '#shared/utils/till'

definePageMeta({ layout: 'tonight', docs: '/docs/tonight/checklist' })
useSeoMeta({ title: 'Checklist' })

const route = useRoute()
const request = useRequestFetch()

const syncedAt = ref<number | null>(null)
const failure = ref<string | null>(null)
// Refused outright: one card, and nothing left to tick (issue 1304).
const refusal = ref<string | null>(null)
const busy = ref(false)
const items = ref<ChecklistEntry[]>([])
// Read from the server on every load: Sign off and close on the night report is what closes it
// (issue 1315), and this screen only says so.
const close = ref<ChecklistClose | null>(null)
// Advisory: only the bar closes a till, so this line ticks itself and never holds the close
// (F-102 criterion 5, issue 1316).
const till = ref<TillLeftOpen | null>(null)
const tillSaid = computed(() => (till.value ? saysTillLeftOpen(till.value) : null))
// Carried on every write below. The hub and the glance hand the house over in the query, and on a
// matinee day opened cold the switcher below is what names it (E-127 criterion 2).
const performanceId = ref<string | null>(typeof route.query.performanceId === 'string' ? route.query.performanceId : null)

// The one list of tonight's houses every show-night screen reads, so none derives "which" a
// second way (E-127 criterion 2, issue 901).
const authority = useNightAuthority()
const choices = computed(() => authority.value.performances.map(one => ({
  performanceId: one.id,
  showTitle: one.showTitle,
  startsAt: one.startsAt,
})))
const ambiguous = ref(false)

// Whether the read named a house decides what a 400 means: with none named, more than one is running.
interface ChecklistRead { named: boolean, settled: SettledRead<TonightChecklist> }

async function read(): Promise<ChecklistRead> {
  const named = performanceId.value
  const settled = await settleRead(() => request<TonightChecklist>(
    '/api/tonight/checklist',
    { query: named ? { performanceId: named } : {} },
  ))
  return { named: named !== null, settled }
}

// Each outcome says both whether the switcher shows and whether the refusal does, so a house chosen
// after either never leaves the other on screen beside it.
function apply({ named, settled }: ChecklistRead): void {
  failure.value = null
  if (settled.kind === 'READ') {
    performanceId.value = settled.value.performanceId
    items.value = settled.value.items
    close.value = settled.value.close
    till.value = settled.value.till
    ambiguous.value = false
    refusal.value = null
    syncedAt.value = settled.at
  }
  // More than one house is running and nothing named one: the switcher is the answer, not a
  // refusal with nothing to tap (issue 1150 item 4).
  else if (!named && settled.status === 400) {
    ambiguous.value = true
    refusal.value = null
  }
  else if (settled.refused) {
    refusal.value = settled.failure
    ambiguous.value = false
  }
  else failure.value = settled.failure
}

async function load(): Promise<void> {
  busy.value = true
  try {
    apply(await read())
  }
  finally {
    busy.value = false
  }
}

// In the served page, so the list, the switcher or the refusal is what a phone paints first.
const waiting = useServedRead('tonight-checklist', read, apply)

function choose(chosen: string): void {
  performanceId.value = chosen
  load()
}

const preItems = computed(() => items.value.filter(item => item.phase === 'PRE'))
const postItems = computed(() => items.value.filter(item => item.phase === 'POST'))
// Tonight's incidents are reviewed by the sign-off itself, so they never count as open here.
const outstandingRequired = computed(() => items.value.filter(holdsTheClose))
const reportLink = computed(() => performanceId.value ? `/tonight/report?performanceId=${performanceId.value}` : '/tonight/report')
</script>

<template>
  <NightScreen
    title="Checklist"
    :refused="refusal"
    hint="Tick each item, or say why it cannot be done tonight. The night closes from the night report."
    :empty="!busy && !waiting && items.length === 0"
    :stale="syncedAt"
    :busy="busy || waiting"
  >
    <UAlert
      v-if="failure"
      data-test="checklist-failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <!-- A matinee day opened cold: name the house rather than refuse into a dead end. -->
    <div
      v-else-if="ambiguous"
      class="space-y-3"
      data-test="checklist-performance-switcher"
    >
      <p class="text-sm text-muted">
        More than one performance is running tonight. Choose the one you are closing.
      </p>
      <NightPerformanceSwitcher
        :performances="choices"
        :selected-id="performanceId"
        @choose="choose"
      />
    </div>

    <div
      v-else-if="!waiting"
      class="space-y-6"
      data-test="checklist-list"
    >
      <UAlert
        v-if="close"
        data-test="checklist-closed"
        color="success"
        variant="subtle"
        :description="saysNightClosed(close)"
      />

      <section
        v-for="(phaseItems, phase) in { PRE: preItems, POST: postItems }"
        :key="phase"
      >
        <h2 class="mb-2 text-sm font-semibold text-muted">
          {{ saysPhase(phase as Phase) }}
        </h2>
        <p
          v-if="phaseItems.length === 0"
          class="text-sm text-muted"
        >
          Nothing on this list yet. Ask the Safety Officer to add the items.
        </p>
        <NightChecklistItems
          :items="phaseItems"
          :performance-id="performanceId"
          @changed="load"
        />
        <!-- Read from the bar's own sessions, never stamped: nothing to tick and no exception to
             take, since only the bar can close a till (F-102 criterion 5, issue 1316). -->
        <div
          v-if="phase === 'POST' && till"
          class="mt-2 flex items-start justify-between gap-2 rounded-lg border border-default p-3"
          data-test="checklist-till"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium">
              The till is closed
            </p>
            <p class="text-xs text-muted">
              {{ tillSaid ?? 'Ticks itself: clear' }}
            </p>
          </div>
          <UIcon
            v-if="!tillSaid"
            name="i-lucide-check"
            class="size-5 shrink-0 text-success"
          />
        </div>
      </section>

      <!-- Nothing final is pinned here: Sign off and close on the night report ends the night,
           and only after the curtain (issue 1315). -->
      <div
        v-if="!close"
        class="space-y-2"
        data-test="checklist-closes-on-report"
      >
        <p class="text-sm text-muted">
          <template v-if="outstandingRequired.length > 0">
            {{ plural(outstandingRequired.length, 'required item') }} still open.
          </template>
          The night closes with Sign off and close on the night report.
        </p>
        <UButton
          :to="reportLink"
          color="neutral"
          variant="outline"
          icon="i-lucide-file-signature"
          class="min-h-12"
        >
          Night report
        </UButton>
      </div>
    </div>
  </NightScreen>
</template>
