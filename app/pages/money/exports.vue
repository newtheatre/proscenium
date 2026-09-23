<script setup lang="ts">
import { can, exportFinance, manageNominalMappings } from '#shared/utils/abilities'
import { describeKind } from '#shared/utils/ledger'
import type { EntrySource } from '#shared/utils/ledger'
import { SU_EXPORT_ROW_CAP, suExportCapRefusal, suExportLines, suExportParams } from '#shared/utils/su-export'
import { currentYear, yearChoices } from '#shared/utils/year'
import type { FinanceSeason } from '#shared/utils/season-dashboard'
import type { NominalMapping, SuExportCoverage, SuExportPeriod } from '#shared/utils/su-export'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Exports', middleware: 'console', docs: '/docs/money/exports' })

const SOURCE_LABELS: Record<EntrySource, string> = {
  DESK: 'Desk',
  TILL: 'Till',
  SELF_SERVE: 'Self-serve',
  IMPORT: 'Import',
  SYSTEM: 'System',
}
const saysSource = (source: EntrySource): string => SOURCE_LABELS[source]

const request = useRequestFetch()
const toast = useToast()

const { data: mappings, status: loading, error, refresh } = await useAsyncData(
  'nominal-mappings',
  () => request<NominalMapping[]>('/api/admin/finance/nominal-mappings'),
  { default: (): NominalMapping[] => [] },
)

const mappingsFailure = computed(() => (error.value ? refusalText(error.value, 'The mappings could not be read.') : null))

const mayManage = computed(() => can(useViewer().value, manageNominalMappings))
const mayExport = computed(() => can(useViewer().value, exportFinance))

const editing = ref<NominalMapping | null>(null)
const draftCode = ref('')
const saving = ref(false)
const saveFailure = ref<string | null>(null)

function edit(mapping: NominalMapping): void {
  editing.value = mapping
  draftCode.value = mapping.nominalCode ?? ''
  saveFailure.value = null
}

async function save(): Promise<void> {
  if (!editing.value) return
  saving.value = true
  saveFailure.value = null
  try {
    await $fetch('/api/admin/finance/nominal-mappings', {
      method: 'POST',
      body: { kind: editing.value.kind, source: editing.value.source, nominalCode: draftCode.value.trim() || null },
    })
    toast.add({ title: 'Mapping saved', icon: 'i-lucide-check', color: 'success' })
    editing.value = null
    await refresh()
  }
  catch (refused) {
    saveFailure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const columns: TableColumn<NominalMapping>[] = [
  { id: 'kind', header: 'Ledger line' },
  { id: 'source', header: 'Source', meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } } },
  { id: 'code', header: 'SU nominal code' },
  { id: 'act', header: ACTIONS_HEADER },
]

const { data: seasons } = await useAsyncData(
  'finance-seasons',
  () => request<{ seasons: FinanceSeason[] }>('/api/admin/finance/seasons').then(response => response.seasons),
  { default: (): FinanceSeason[] => [] },
)

const today = londonDay(new Date())
const from = ref(today)
const to = ref(today)
const year = ref(currentYear())
const years = yearChoices(year.value)
const seasonId = ref((seasons.value.find(one => one.fromDay <= today && today <= one.toDay) ?? seasons.value[0])?.id ?? '')
const seasonItems = computed(() => seasons.value.map(one => ({ label: one.name, value: one.id })))

// The yearly return is the reason this screen exists, so it opens on this year (I-108 criterion 4).
const kind = ref<SuExportPeriod['kind']>('YEAR')
const kindItems = computed<{ label: string, value: SuExportPeriod['kind'] }[]>(() => [
  { label: 'Year', value: 'YEAR' },
  ...(seasons.value.length > 0 ? [{ label: 'Season', value: 'SEASON' as const }] : []),
  { label: 'Custom range', value: 'RANGE' },
])

const period = computed<SuExportPeriod | null>(() => {
  if (kind.value === 'YEAR') return { kind: 'YEAR', year: year.value }
  if (kind.value === 'SEASON') return seasonId.value ? { kind: 'SEASON', seasonId: seasonId.value } : null
  return from.value && to.value && to.value >= from.value ? { kind: 'RANGE', fromDay: from.value, toDay: to.value } : null
})
const params = computed(() => (period.value ? suExportParams(period.value) : null))

// A GET link, not a fetch: the browser follows the content-disposition header and saves the
// file itself, the same shape bar/reports.vue's own CSV export already uses.
const exportUrl = computed(() => `/api/admin/finance/export?${new URLSearchParams(params.value ?? {}).toString()}`)

const { data: coverage, error: coverageError } = await useAsyncData(
  'su-export-coverage',
  () => (mayExport.value && params.value
    ? request<SuExportCoverage>('/api/admin/finance/export/coverage', { query: params.value })
    : Promise.resolve(null)),
  { watch: [params] },
)
const coverageFailure = computed(() => (coverageError.value ? refusalText(coverageError.value, 'What this export covers could not be read.') : null))
const overCap = computed(() => (coverage.value?.rows ?? 0) > SU_EXPORT_ROW_CAP)
</script>

<template>
  <div class="space-y-8">
    <section
      class="space-y-4"
      data-test="section-export"
    >
      <h2 class="font-semibold">
        SU export
      </h2>
      <AdminToolbar :filterable="false">
        <template #actions>
          <USelect
            v-model="kind"
            aria-label="Period"
            data-test="export-kind"
            :items="kindItems"
            value-key="value"
          />
          <USelect
            v-if="kind === 'YEAR'"
            v-model="year"
            aria-label="Year"
            data-test="export-year"
            :items="years"
            value-key="value"
          />
          <USelect
            v-if="kind === 'SEASON'"
            v-model="seasonId"
            aria-label="Season"
            data-test="export-season"
            :items="seasonItems"
            value-key="value"
          />
          <template v-if="kind === 'RANGE'">
            <DateField
              v-model="from"
              data-test="export-from"
            />
            <DateField
              v-model="to"
              data-test="export-to"
            />
          </template>
          <UButton
            v-if="mayExport"
            data-test="export-csv"
            icon="i-lucide-download"
            :to="exportUrl"
            external
            target="_blank"
            :disabled="!period || overCap"
          >
            Export CSV
          </UButton>
        </template>
      </AdminToolbar>

      <UAlert
        v-if="coverageFailure"
        data-test="export-status-failure"
        color="error"
        variant="subtle"
        :description="coverageFailure"
      />
      <UAlert
        v-else-if="overCap"
        data-test="export-over-cap"
        color="error"
        variant="subtle"
        :description="suExportCapRefusal()"
      />
      <p
        v-if="coverage"
        class="text-sm text-muted"
        data-test="export-status"
      >
        {{ saysDay(coverage.fromDay, { year: true }) }} to {{ saysDay(coverage.toDay, { year: true }) }},
        {{ suExportLines(coverage.rows) }}.
        <template v-if="coverage.closed">
          <strong>Closed</strong>: nothing can post into these days, so taking the export again gives the same file unless a nominal code below is changed.
        </template>
        <template v-else>
          <strong>Open</strong>: the figures may still move until the period is closed, so treat the file as provisional.
        </template>
      </p>
    </section>

    <section
      class="space-y-4"
      data-test="section-mappings"
    >
      <h2 class="font-semibold">
        Nominal code mappings
      </h2>

      <UAlert
        v-if="mappingsFailure"
        data-test="mappings-failure"
        color="error"
        variant="subtle"
        :description="mappingsFailure"
      />

      <UTable
        :data="mappings"
        :loading="loading === 'pending'"
        :columns="columns"
        data-test="mappings-table"
      >
        <template #kind-cell="{ row }">
          <div>
            {{ describeKind(row.original.kind) }}
            <!-- Below sm the source is hidden: shown here instead, so a phone keeps the code and
              Edit in view without losing what it said (issue 922). -->
            <div class="text-xs text-muted sm:hidden">
              {{ saysSource(row.original.source) }}
            </div>
          </div>
        </template>
        <template #source-cell="{ row }">
          {{ saysSource(row.original.source) }}
        </template>
        <template #code-cell="{ row }">
          {{ row.original.nominalCode ?? 'Unmapped' }}
        </template>
        <template #act-cell="{ row }">
          <UButton
            v-if="mayManage"
            size="sm"
            variant="subtle"
            color="neutral"
            :data-test="`edit-${row.original.kind}-${row.original.source}`"
            @click="edit(row.original)"
          >
            Edit
          </UButton>
        </template>
        <template #empty>
          <p class="py-6 text-center text-sm text-muted">
            No known ledger line and source pair yet.
          </p>
        </template>
      </UTable>
    </section>

    <UModal
      :open="Boolean(editing)"
      title="Change the nominal code"
      description="An export line with no mapping still exports, marked unmapped."
      @update:open="(open: boolean) => { if (!open) editing = null }"
    >
      <template #body>
        <div
          v-if="editing"
          class="space-y-4"
        >
          <UAlert
            v-if="saveFailure"
            data-test="edit-failure"
            color="error"
            variant="subtle"
            :description="saveFailure"
          />
          <p class="text-sm text-muted">
            {{ describeKind(editing.kind) }}, {{ saysSource(editing.source) }}
          </p>
          <UFormField
            label="SU nominal code"
            description="Left blank, this pair exports on the explicit unmapped line."
          >
            <UInput
              v-model="draftCode"
              class="w-full"
              data-test="edit-code"
            />
          </UFormField>
          <div class="flex gap-2">
            <UButton
              data-test="save-mapping"
              :loading="saving"
              @click="save"
            >
              Save
            </UButton>
            <UButton
              variant="ghost"
              @click="editing = null"
            >
              {{ CONFIRM_BACK_LABEL }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
