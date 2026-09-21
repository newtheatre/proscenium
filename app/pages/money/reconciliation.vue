<script setup lang="ts">
import { h } from 'vue'
import { saysMoney } from '#shared/utils/bar'
import { penceFromPounds } from '#shared/utils/admin-forms'
import { describeKind } from '#shared/utils/ledger'
import { can, recordZReadings } from '#shared/utils/abilities'
import { currentShowNight } from '#shared/utils/show-night'
import type { NightExpected, OutstandingNight, ZReading } from '#shared/utils/night-reconciliation'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Daily reconciliation', middleware: 'console', docs: '/docs/money/reconciliation' })

const request = useRequestFetch()
const toast = useToast()

const night = ref(currentShowNight())
// The field takes pounds and pence as they are read off the reader; the route still takes pence,
// and the expected-total rule is untouched (0004, K-123 criterion 2).
const readerFigure = ref('')
const readerPence = computed(() => penceFromPounds(readerFigure.value))
const note = ref('')
const writeOff = ref(false)
const saving = ref(false)

interface ReconciliationResponse { night: string, expected: NightExpected, current: ZReading | null, history: ZReading[] }

const { data, status, error, refresh } = await useAsyncData(
  'night-reconciliation',
  () => request<ReconciliationResponse>('/api/admin/finance/reconciliation', { query: { night: night.value } }),
  { watch: [night] },
)

const { data: outstanding, refresh: refreshOutstanding } = await useAsyncData(
  'night-reconciliation-outstanding',
  () => request<{ missing: OutstandingNight[], openVariance: OutstandingNight[] }>('/api/admin/finance/reconciliation/outstanding'),
  { default: () => ({ missing: [], openVariance: [] }) },
)

const reconciliationFailure = computed(() => (error.value ? refusalText(error.value, 'The reconciliation could not be read.') : null))

const mayRecord = computed(() => can(useViewer().value, recordZReadings))

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
    header: 'Desk, by kind',
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
  { id: 'reader', header: 'Reader', meta: RIGHT_ALIGNED, cell: ({ row }) => saysMoney(row.original.readerPence) },
  { id: 'variance', header: 'Variance', meta: RIGHT_ALIGNED, cell: ({ row }) => saysMoney(row.original.variancePence) },
  { id: 'by', header: 'By', cell: ({ row }) => row.original.enteredByName },
  { id: 'note', header: 'Note', cell: ({ row }) => row.original.note ?? '' },
]

async function record(): Promise<void> {
  if (readerPence.value === null) return
  saving.value = true
  try {
    await request('/api/admin/finance/reconciliation', {
      method: 'POST',
      body: {
        night: night.value,
        readerPence: readerPence.value,
        note: note.value.trim() || undefined,
        supersedesId: data.value?.current?.id,
        writtenOff: writeOff.value,
      },
    })
    readerFigure.value = ''
    note.value = ''
    writeOff.value = false
    await Promise.all([refresh(), refreshOutstanding()])
  }
  catch (recordError) {
    toast.add({ title: refusalText(recordError, 'That reading could not be recorded.'), color: 'error' })
  }
  finally {
    saving.value = false
  }
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
        <UButton
          data-test="refresh-reconciliation"
          variant="subtle"
          @click="refresh()"
        >
          Refresh
        </UButton>
      </template>
    </AdminToolbar>

    <UAlert
      v-if="(outstanding?.missing.length ?? 0) > 0 || (outstanding?.openVariance.length ?? 0) > 0"
      data-test="outstanding-alert"
      color="warning"
      variant="subtle"
      title="Nights needing attention"
    >
      <template #description>
        <p v-if="outstanding && outstanding.missing.length > 0">
          No reading recorded: {{ outstanding.missing.map(row => row.night).join(', ') }}
        </p>
        <p v-if="outstanding && outstanding.openVariance.length > 0">
          Open variance: {{ outstanding.openVariance.map(row => row.night).join(', ') }}
        </p>
      </template>
    </UAlert>

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
          Expected for the night of {{ data.night }}
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
          v-if="!data.current"
          class="text-muted"
        >
          No reading recorded for this night.
        </p>
        <p
          v-else
          data-test="current-reading"
        >
          Reader {{ saysMoney(data.current.readerPence) }}, variance {{ saysMoney(data.current.variancePence) }},
          entered by {{ data.current.enteredByName }}
          <span v-if="data.current.writtenOff">(written off)</span>
        </p>
      </section>

      <section
        v-if="mayRecord"
        class="space-y-2"
        data-test="section-record"
      >
        <h2 class="font-semibold">
          {{ data.current ? 'Resolve the variance' : 'Record this night\'s reading' }}
        </h2>
        <UFormField
          label="Reader figure"
          description="As the reader shows it, in pounds and pence."
        >
          <UInput
            v-model="readerFigure"
            data-test="reader-pence"
            placeholder="123.45"
          />
        </UFormField>
        <p
          v-if="readerFigure.trim() !== ''"
          class="text-sm"
          :class="readerPence === null ? 'text-error' : 'text-muted'"
          data-test="reader-parsed"
        >
          {{ readerPence === null ? 'Give the figure as pounds and pence, such as 123.45.' : `Recording ${saysMoney(readerPence)}.` }}
        </p>
        <UTextarea
          v-model="note"
          data-test="reading-note"
          placeholder="Note (needed only if this differs from the expected figure)"
        />
        <UCheckbox
          v-if="data.current"
          v-model="writeOff"
          data-test="write-off"
          label="Write off rather than correct"
        />
        <UButton
          data-test="record-reading"
          :loading="saving"
          :disabled="readerPence === null"
          @click="record"
        >
          Record
        </UButton>
      </section>

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
