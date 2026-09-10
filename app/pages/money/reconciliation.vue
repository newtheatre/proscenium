<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { can, recordZReadings } from '#shared/utils/abilities'
import { currentShowNight } from '#shared/utils/show-night'
import type { NightExpected, OutstandingNight, ZReading } from '#shared/utils/night-reconciliation'

definePageMeta({ layout: 'console', title: 'Daily reconciliation', middleware: 'console' })

const request = useRequestFetch()
const toast = useToast()

const night = ref(currentShowNight())
const readerPence = ref<number | undefined>()
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

async function record(): Promise<void> {
  if (readerPence.value === undefined) return
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
    readerPence.value = undefined
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
    <AdminToolbar :filterable="false">
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
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b text-left text-muted">
              <th class="py-2">
                Desk, by kind
              </th><th>Pence</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.expected.deskByKind"
              :key="row.kind"
            >
              <td class="py-2">
                {{ row.kind }}
              </td>
              <td>{{ saysMoney(row.totalPence) }}</td>
            </tr>
            <tr class="border-t">
              <td class="py-2">
                Desk total
              </td>
              <td>{{ saysMoney(data.expected.deskTakingsPence) }}</td>
            </tr>
            <tr>
              <td class="py-2">
                Bar card sales
              </td>
              <td>{{ saysMoney(data.expected.bar.cardSalesPence) }}</td>
            </tr>
            <tr>
              <td class="py-2">
                Bar tab settlements
              </td>
              <td>{{ saysMoney(data.expected.bar.tabSettlementsPence) }}</td>
            </tr>
            <tr class="border-t font-semibold">
              <td class="py-2">
                Expected total
              </td>
              <td data-test="expected-total">
                {{ saysMoney(data.expected.expectedPence) }}
              </td>
            </tr>
          </tbody>
        </table>
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
        <UInputNumber
          v-model="readerPence"
          data-test="reader-pence"
          placeholder="Reader figure, in pence"
        />
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
          :disabled="readerPence === undefined"
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
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b text-left text-muted">
              <th class="py-2">
                Reader
              </th><th>Variance</th><th>By</th><th>Note</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.history"
              :key="row.id"
              data-test="history-row"
            >
              <td class="py-2">
                {{ saysMoney(row.readerPence) }}
              </td>
              <td>{{ saysMoney(row.variancePence) }}</td>
              <td>{{ row.enteredByName }}</td>
              <td>{{ row.note ?? '' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>
