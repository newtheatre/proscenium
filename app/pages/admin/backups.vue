<script setup lang="ts">
import { restoreDrillForm } from '#shared/utils/backup'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import type { RestoreDrillForm } from '#shared/utils/backup'

definePageMeta({ layout: 'console', title: 'Backups', middleware: 'console' })

interface Status {
  lastDrillAt: string | null
  lastDrillOutcome: 'PASS' | 'FAIL' | null
  intervalDays: number | null
  overdue: boolean
}

interface Drill {
  id: string
  ranAt: string
  operatorName: string
  outcome: 'PASS' | 'FAIL'
  timeToRestoreMinutes: number
  rowCountsMatch: boolean
  moneyTotalsMatch: boolean
  notes: string | null
  createdAt: number
}

interface Listing {
  items: Drill[]
  total: number
  pages: number
  page: number
  pageSize: number
}

const status = ref<Status | null>(null)
const listing = ref<Listing | null>(null)
const page = ref(1)
const search = ref('')
const loading = ref(false)
const failure = ref<string | null>(null)
const recording = ref(false)

const toast = useToast()
const drillForm = useTemplateRef('drillForm')
const drill = reactive<Partial<RestoreDrillForm>>({})

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    const [statusResult, listingResult] = await Promise.all([
      $fetch<Status>('/api/admin/backups'),
      $fetch<Listing>('/api/admin/backups/drills', { query: { page: page.value, search: search.value || undefined } }),
    ])
    status.value = statusResult
    listing.value = listingResult
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    loading.value = false
  }
}

async function record(event: FormSubmitEvent<RestoreDrillForm>): Promise<void> {
  failure.value = null
  try {
    await $fetch('/api/admin/backups/drills', { method: 'POST', body: event.data })
    toast.add({ title: 'Drill recorded', icon: 'i-lucide-database-backup', color: 'success' })
    recording.value = false
    drill.ranAt = undefined
    drill.outcome = undefined
    drill.timeToRestoreMinutes = undefined
    drill.rowCountsMatch = undefined
    drill.moneyTotalsMatch = undefined
    drill.notes = undefined
    page.value = 1
    await load()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

watch(page, load)
watch(search, () => {
  page.value = 1
  void load()
})

const columns: TableColumn<Drill>[] = [
  { accessorKey: 'ranAt', header: 'Ran', meta: { class: { td: 'font-mono text-sm whitespace-nowrap' } } },
  { accessorKey: 'outcome', header: 'Outcome' },
  { accessorKey: 'operatorName', header: 'Operator' },
  { accessorKey: 'timeToRestoreMinutes', header: 'Minutes to restore' },
  {
    id: 'reconciled',
    header: 'Reconciled',
    cell: ({ row }) => [
      row.original.rowCountsMatch ? 'Row counts' : null,
      row.original.moneyTotalsMatch ? 'Money totals' : null,
    ].filter(Boolean).join(', ') || 'Neither',
  },
  { accessorKey: 'notes', header: 'Notes', meta: { class: { td: 'text-sm text-muted' } } },
]

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UPageCard
      title="Restore drill"
      description="Proves the backup by actually restoring it: row counts and money totals reconciled against production (K-108, J-107)."
    >
      <template v-if="status">
        <UAlert
          v-if="status.overdue"
          data-test="drill-overdue"
          color="warning"
          variant="subtle"
          icon="i-lucide-alert-triangle"
          :title="status.lastDrillAt ? 'A drill is overdue' : 'No drill has ever passed'"
          :description="status.intervalDays
            ? `The configured interval is ${status.intervalDays} days.`
            : 'No cadence is configured, so this should not be flagged.'"
        />
        <p
          v-else
          data-test="drill-current"
          class="text-sm text-muted"
        >
          Last passing drill: {{ status.lastDrillAt ?? 'never' }}.
          <span v-if="status.lastDrillOutcome === 'FAIL'"> The most recent attempt failed and is not counted.</span>
        </p>
      </template>
    </UPageCard>

    <AdminToolbar
      v-model:search="search"
      placeholder="A name or a note"
      :loading="loading"
      :filterable="false"
      @clear="search = ''"
    >
      <template #actions>
        <UButton
          data-test="record-drill"
          icon="i-lucide-database-backup"
          @click="recording = true"
        >
          Record a drill
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="listing?.items ?? []"
      :columns="columns"
      :loading="loading"
      data-test="drills-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          No drill has been recorded yet.
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="drills-total"
        class="text-sm text-muted"
      >
        {{ plural(listing?.total ?? 0, 'drill') }}
      </p>
      <UPagination
        v-if="listing && listing.pages > 1"
        v-model:page="page"
        :total="listing.total"
        :items-per-page="listing.pageSize"
      />
    </div>

    <UModal
      v-model:open="recording"
      title="Record a restore drill"
      description="Whether it passed or failed, record what it reconciled: a failure is the finding, not a reason to omit it."
    >
      <template #body>
        <UForm
          ref="drillForm"
          :schema="restoreDrillForm"
          :state="drill"
          class="space-y-4"
          @submit="record"
        >
          <UFormField
            name="ranAt"
            label="Date run"
            required
          >
            <DateField
              v-model="drill.ranAt"
              data-test="drill-date"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="outcome"
            label="Outcome"
            required
          >
            <USelect
              v-model="drill.outcome"
              data-test="drill-outcome"
              :items="['PASS', 'FAIL']"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="timeToRestoreMinutes"
            label="Minutes to restore"
            required
          >
            <UInputNumber
              v-model="drill.timeToRestoreMinutes"
              data-test="drill-minutes"
              :min="1"
              class="w-full"
            />
          </UFormField>
          <UFormField name="rowCountsMatch">
            <UCheckbox
              v-model="drill.rowCountsMatch"
              data-test="drill-row-counts"
              label="Row counts matched production"
            />
          </UFormField>
          <UFormField name="moneyTotalsMatch">
            <UCheckbox
              v-model="drill.moneyTotalsMatch"
              data-test="drill-money-totals"
              label="Money totals matched production"
            />
          </UFormField>
          <UFormField
            name="notes"
            label="Notes"
            description="What did not reconcile, or anything else worth recording."
          >
            <UTextarea
              v-model="drill.notes"
              data-test="drill-notes"
              :rows="3"
              autoresize
              :maxrows="6"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            data-test="drill-submit"
          >
            Record it
          </UButton>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
