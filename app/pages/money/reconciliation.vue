<script setup lang="ts">
import { h } from 'vue'
import { saysMoney } from '#shared/utils/bar'
import { penceFromPounds } from '#shared/utils/admin-forms'
import { describeKind } from '#shared/utils/ledger'
import { can, recordZReadings } from '#shared/utils/abilities'
import { liveVariance, nightFromQuery } from '#shared/utils/night-reconciliation'
import { currentShowNight } from '#shared/utils/show-night'
import { saysDayLong } from '#shared/utils/when'
import type { NightExpected, ZReading } from '#shared/utils/night-reconciliation'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Daily reconciliation', middleware: 'console', docs: '/docs/money/daily-reconciliation' })

const request = useRequestFetch()
const toast = useToast()
const route = useRoute()

// The night lives in the address, so a night listed anywhere links straight to it (issue 1360).
const night = computed<string>({
  get: () => nightFromQuery(route.query.night, currentShowNight()),
  set: (value) => {
    void navigateTo({ query: { ...route.query, night: value } }, { replace: true })
  },
})

// The field takes pounds and pence as they are read off the reader; the route still takes pence,
// and the expected-total rule is untouched (0004, K-123 criterion 2).
const readerFigure = ref('')
const readerPence = computed(() => penceFromPounds(readerFigure.value))
const note = ref('')
const writeOffNote = ref('')
const saving = ref<'record' | 'check' | 'write-off' | null>(null)

// The page stays mounted as the night changes, so what was typed for one night is cleared.
watch(night, () => {
  readerFigure.value = ''
  note.value = ''
  writeOffNote.value = ''
})

interface ReconciliationResponse { night: string, expected: NightExpected, current: ZReading | null, history: ZReading[] }

const { data, status, error, refresh } = await useAsyncData(
  'night-reconciliation',
  () => request<ReconciliationResponse>('/api/admin/finance/reconciliation', { query: { night: night.value } }),
  { watch: [night] },
)

const reconciliationFailure = computed(() => (error.value ? refusalText(error.value, 'The reconciliation could not be read.') : null))

const mayRecord = computed(() => can(useViewer().value, recordZReadings))

// Said as the figure is typed, the same sign the recorded variance carries: reader less expected.
const variance = computed(() => (data.value ? liveVariance(readerPence.value, data.value.expected.expectedPence) : null))
const noteMissing = computed(() => variance.value !== null && variance.value !== 0 && !note.value.trim())

// The live reading's own figure against what we expect now: a sale found since may have closed it.
const current = computed(() => data.value?.current ?? null)
const open = computed(() => current.value !== null && current.value.variancePence !== 0 && !current.value.writtenOff)
const varianceNow = computed(() => (current.value && data.value ? liveVariance(current.value.readerPence, data.value.expected.expectedPence) : null))

// The expected sheet is a list of amounts, its totals rows of the same table: a total read
// somewhere else is a total nobody checks against the lines above it.
interface ExpectedRow { label: string, pence: number, test?: string, strong?: boolean }

const expectedRows = computed<ExpectedRow[]>(() => {
  if (!data.value) return []
  const expected = data.value.expected
  return [
    ...expected.deskByKind.map(row => ({ label: describeKind(row.kind), pence: row.totalPence })),
    { label: 'Desk total', pence: expected.deskTakingsPence },
    { label: 'Bar card sales', pence: expected.bar.cardSalesPence + expected.bar.ticketsPence },
    { label: 'Bar tab settlements', pence: expected.bar.tabSettlementsPence },
    { label: 'Expected total', pence: expected.expectedPence, test: 'expected-total', strong: true },
  ]
})

const expectedColumns: TableColumn<ExpectedRow>[] = [
  {
    id: 'label',
    header: 'Where it was taken',
    cell: ({ row }) => h('span', { class: row.original.strong ? 'font-semibold' : undefined }, row.original.label),
  },
  {
    id: 'amount',
    header: 'Amount',
    meta: RIGHT_ALIGNED,
    cell: ({ row }) => h('span', {
      'class': row.original.strong ? 'font-semibold' : undefined,
      'data-test': row.original.test,
    }, saysMoney(row.original.pence)),
  },
]

const historyColumns: TableColumn<ZReading>[] = [
  {
    id: 'reader',
    header: 'Reader',
    meta: { class: { td: 'text-right whitespace-nowrap font-mono' } },
    cell: ({ row }) => h('div', {}, [
      h('div', {}, saysMoney(row.original.readerPence)),
      // Below sm who entered it and their note are hidden: shown here instead, so a phone keeps
      // the variance in view without losing what they said (issue 922).
      h('div', { class: 'sm:hidden text-xs text-muted' }, [row.original.enteredByName, row.original.note].filter(Boolean).join(', ')),
    ]),
  },
  {
    id: 'variance',
    header: 'Variance',
    meta: RIGHT_ALIGNED,
    cell: ({ row }) => `${saysMoney(row.original.variancePence)}${row.original.writtenOff ? ', written off' : ''}`,
  },
  { id: 'by', header: 'By', meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } }, cell: ({ row }) => row.original.enteredByName },
  { id: 'note', header: 'Note', meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } }, cell: ({ row }) => row.original.note ?? '' },
]

async function post(kind: 'record' | 'check' | 'write-off', body: Record<string, unknown>): Promise<void> {
  if (saving.value) return
  saving.value = kind
  try {
    await request('/api/admin/finance/reconciliation', { method: 'POST', body: { night: night.value, ...body } })
    readerFigure.value = ''
    note.value = ''
    writeOffNote.value = ''
    await Promise.all([refresh(), refreshNuxtData('nights-needing-you')])
  }
  catch (recordError) {
    toast.add({ title: refusalText(recordError, 'That reading could not be recorded.'), color: 'error' })
  }
  finally {
    saving.value = null
  }
}

// A first reading, or a correction naming the live one it supersedes (I-104 criterion 4).
function record(): Promise<void> {
  if (readerPence.value === null || noteMissing.value) return Promise.resolve()
  return post('record', {
    readerPence: readerPence.value,
    note: note.value.trim() || undefined,
    supersedesId: current.value?.id,
    writtenOff: false,
  })
}

// The same figure again, against what we expect now: offered only once the two agree.
function checkAgain(): Promise<void> {
  if (!current.value || varianceNow.value !== 0) return Promise.resolve()
  return post('check', { readerPence: current.value.readerPence, supersedesId: current.value.id, writtenOff: false })
}

// The route reads the figure back from the reading it resolves, so nothing is retyped.
function writeOff(): Promise<void> {
  if (!current.value || !data.value || !writeOffNote.value.trim()) return Promise.resolve()
  return post('write-off', {
    supersedesId: current.value.id,
    writtenOff: true,
    note: writeOffNote.value.trim(),
    expectedPence: data.value.expected.expectedPence,
  })
}
</script>

<template>
  <div class="space-y-6">
    <AdminToolbar
      :filterable="false"
      :searchable="false"
    >
      <template #actions>
        <DateField
          v-model="night"
          data-test="reconciliation-night"
        />
      </template>
    </AdminToolbar>

    <MoneyNightsNeedingYou />

    <UAlert
      v-if="reconciliationFailure"
      data-test="reconciliation-failure"
      color="error"
      variant="subtle"
      :description="reconciliationFailure"
    />

    <template v-else-if="status !== 'pending' && data">
      <section
        class="space-y-2"
        data-test="section-expected"
      >
        <h2 class="font-semibold">
          Expected for the night of {{ saysDayLong(data.night) }}
        </h2>
        <UTable
          :data="expectedRows"
          :columns="expectedColumns"
          data-test="expected-table"
        >
          <template #empty>
            <p class="py-6 text-center text-sm text-muted">
              Nothing was taken on this night.
            </p>
          </template>
        </UTable>
        <p class="text-sm text-muted">
          Desk comps {{ saysMoney(data.expected.deskCompsPence) }}, desk discounts {{ saysMoney(data.expected.deskDiscountsPence) }},
          bar comps {{ saysMoney(data.expected.bar.compsForegonePence) }}, bar discounts {{ saysMoney(data.expected.bar.discountsPence) }},
          bar refunds {{ saysMoney(data.expected.bar.refundsPence) }} (already netted into the total above).
        </p>
      </section>

      <section
        class="space-y-2"
        data-test="section-current"
      >
        <h2 class="font-semibold">
          Current reading
        </h2>
        <p
          v-if="!current"
          class="text-muted"
        >
          No reading recorded for this night.
        </p>
        <template v-else>
          <p data-test="current-reading">
            Reader {{ saysMoney(current.readerPence) }}, variance {{ saysMoney(current.variancePence) }},
            entered by {{ current.enteredByName }}
            <span v-if="current.writtenOff">(written off)</span>
          </p>
          <p
            v-if="varianceNow !== null && varianceNow !== current.variancePence"
            class="text-sm text-muted"
            data-test="variance-now"
          >
            Against what we expect now, the variance is {{ saysMoney(varianceNow) }}.
          </p>
        </template>
      </section>

      <template v-if="mayRecord">
        <section
          v-if="open && current"
          class="space-y-4"
          data-test="section-resolve"
        >
          <h2 class="font-semibold">
            Resolve the variance
          </h2>

          <div class="space-y-2">
            <h3 class="text-sm font-medium">
              Check again
            </h3>
            <p class="text-sm text-muted">
              {{ varianceNow === 0
                ? `We now expect ${saysMoney(current.readerPence)}, which is what the reader showed. Checking again records the same figure and closes the variance.`
                : 'Once the missing sale or refund is in the ledger, check again: the same reader figure is recorded against what we expect then, with nothing retyped.' }}
            </p>
            <UButton
              color="neutral"
              variant="outline"
              data-test="check-again"
              :disabled="varianceNow !== 0"
              :loading="saving === 'check'"
              @click="checkAgain"
            >
              Check again
            </UButton>
          </div>

          <div class="space-y-2">
            <h3 class="text-sm font-medium">
              Write off
            </h3>
            <UFormField
              label="Why the difference is accepted"
              required
            >
              <UTextarea
                v-model="writeOffNote"
                class="w-full"
                data-test="write-off-note"
              />
            </UFormField>
            <UButton
              color="warning"
              variant="subtle"
              data-test="write-off"
              :disabled="!writeOffNote.trim() || varianceNow === 0"
              :loading="saving === 'write-off'"
              @click="writeOff"
            >
              Write off {{ saysMoney(varianceNow ?? current.variancePence) }}
            </UButton>
          </div>
        </section>

        <section
          class="space-y-2"
          data-test="section-record"
        >
          <h2 class="font-semibold">
            {{ current ? 'Correct the reading' : 'Record this night\'s reading' }}
          </h2>
          <UFormField
            label="Reader total (Z)"
            description="As the reader shows it, in pounds and pence."
          >
            <div class="flex flex-wrap items-center gap-2">
              <UInput
                v-model="readerFigure"
                data-test="reader-pence"
                placeholder="123.45"
              />
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                data-test="reader-zero"
                @click="readerFigure = '0.00'"
              >
                Reader shows £0.00
              </UButton>
            </div>
          </UFormField>
          <p
            v-if="readerFigure.trim() !== ''"
            class="text-sm"
            :class="readerPence === null ? 'text-error' : 'text-muted'"
            data-test="reader-parsed"
          >
            {{ readerPence === null ? 'Give the figure as pounds and pence, such as 123.45.' : `Recording ${saysMoney(readerPence)}.` }}
          </p>
          <p
            v-if="variance !== null"
            class="text-sm"
            :class="variance === 0 ? 'text-success' : 'text-warning'"
            data-test="live-variance"
          >
            {{ variance === 0
              ? `That matches the ${saysMoney(data.expected.expectedPence)} we expect.`
              : `That differs from the ${saysMoney(data.expected.expectedPence)} we expect by ${saysMoney(variance)}: say why below.` }}
          </p>
          <UFormField
            label="Note"
            description="Needed only where this differs from the expected figure."
            :required="variance !== null && variance !== 0"
          >
            <UTextarea
              v-model="note"
              class="w-full"
              data-test="reading-note"
            />
          </UFormField>
          <UButton
            v-if="!current"
            data-test="record-reading"
            :loading="saving === 'record'"
            :disabled="readerPence === null || noteMissing"
            @click="record"
          >
            Record
          </UButton>
          <UButton
            v-else
            color="neutral"
            variant="outline"
            data-test="correct-reading"
            :loading="saving === 'record'"
            :disabled="readerPence === null || noteMissing"
            @click="record"
          >
            Record the correction
          </UButton>
        </section>
      </template>

      <section
        v-if="data.history.length > 0"
        class="space-y-2"
        data-test="section-history"
      >
        <h2 class="font-semibold">
          History
        </h2>
        <UTable
          :data="data.history"
          :columns="historyColumns"
          data-test="history-table"
        >
          <template #empty>
            <p class="py-6 text-center text-sm text-muted">
              No reading has been recorded for this night.
            </p>
          </template>
        </UTable>
      </section>
    </template>
  </div>
</template>
