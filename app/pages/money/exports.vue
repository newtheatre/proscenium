<script setup lang="ts">
import { can, exportFinance, manageNominalMappings } from '#shared/utils/abilities'
import { describeKind } from '#shared/utils/ledger'
import type { EntrySource } from '#shared/utils/ledger'
import type { NominalMapping } from '#shared/utils/su-export'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Exports', middleware: 'console' })

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
  { id: 'source', header: 'Source' },
  { id: 'code', header: 'SU nominal code' },
  { id: 'act', header: '' },
]

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const from = ref(today)
const to = ref(today)

// A GET link, not a fetch: the browser follows the content-disposition header and saves the
// file itself, the same shape bar/reports.vue's own CSV export already uses.
const exportUrl = computed(() => `/api/admin/finance/export?${new URLSearchParams({ fromDay: from.value, toDay: to.value }).toString()}`)
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
          <DateField
            v-model="from"
            data-test="export-from"
          />
          <DateField
            v-model="to"
            data-test="export-to"
          />
          <UButton
            v-if="mayExport"
            data-test="export-csv"
            icon="i-lucide-download"
            :to="exportUrl"
            :disabled="!from || !to || to < from"
          >
            Export CSV
          </UButton>
        </template>
      </AdminToolbar>
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
          {{ describeKind(row.original.kind) }}
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
      description="An export line whose pair carries no mapping still exports, marked unmapped rather than dropped."
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
              Cancel
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
