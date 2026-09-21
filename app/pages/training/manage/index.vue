<script setup lang="ts">
import { MAX_PAGE_SIZE } from '#shared/utils/pagination'
import type { CatalogueModule } from '~/components/training/CatalogueTable.vue'

definePageMeta({ layout: 'console', title: 'Catalogue', middleware: 'console', docs: '/docs/training/catalogue' })

interface Department { code: string, name: string }
interface Listing { items: CatalogueModule[], total: number, pageSize: number, pages: number }

const request = useRequestFetch()
const empty = (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 })

const { data: departments } = await useAsyncData(
  'training-modules-departments',
  () => request<{ items: Department[] }>('/api/admin/training/departments'),
  { default: () => ({ items: [] as Department[] }) },
)

// The prerequisite editor needs every module as a candidate, not only the table's current page:
// a separate, unfiltered read rather than widening the table's own paged one (K-129).
const { data: everyModule, refresh: refreshCandidates } = await useAsyncData(
  'training-modules-candidates',
  () => request<Listing>('/api/admin/training/modules', { query: { pageSize: MAX_PAGE_SIZE } }),
  { default: empty },
)

const table = ref<{ refresh: () => Promise<void> } | null>(null)
const open = ref(false)
const editing = ref<CatalogueModule | null>(null)

function add(): void {
  editing.value = null
  open.value = true
}

function edit(module: CatalogueModule): void {
  editing.value = module
  open.value = true
}

async function saved(): Promise<void> {
  await Promise.all([table.value?.refresh(), refreshCandidates()])
}
</script>

<template>
  <div class="space-y-6">
    <p class="text-sm text-muted">
      What the theatre teaches, and how long each one lasts.
    </p>

    <TrainingCatalogueTable
      ref="table"
      :departments="departments.items"
      @add="add"
      @edit="edit"
    />

    <TrainingModuleEditor
      v-model:open="open"
      :module="editing"
      :departments="departments.items"
      :candidates="everyModule.items"
      @saved="saved"
    />
  </div>
</template>
