<script setup lang="ts">
import type { CatalogueModule } from '~/components/training/CatalogueTable.vue'

definePageMeta({ layout: 'console', title: 'Training catalogue', middleware: 'console' })

interface Department { code: string, name: string }

const request = useRequestFetch()

const { data, status, refresh } = await useAsyncData(
  'training-modules',
  () => request<{ items: CatalogueModule[], total: number }>('/api/admin/training/modules'),
  { default: (): { items: CatalogueModule[], total: number } => ({ items: [], total: 0 }) },
)

const { data: departments } = await useAsyncData(
  'training-modules-departments',
  () => request<{ items: Department[] }>('/api/admin/training/departments'),
  { default: () => ({ items: [] as Department[] }) },
)

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
  await refresh()
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-graduation-cap"
      title="What the theatre teaches, and how long each one is worth"
      description="A module declares its expiry policy once. Whether somebody currently holds it is worked out from the dates on their record every time it is asked, so nothing here has to be kept up to date."
    />

    <TrainingCatalogueTable
      :modules="data.items"
      :departments="departments.items"
      :loading="status === 'pending'"
      @add="add"
      @edit="edit"
    />

    <TrainingModuleEditor
      v-model:open="open"
      :module="editing"
      :departments="departments.items"
      :candidates="data.items"
      @saved="saved"
    />
  </div>
</template>
