<script setup lang="ts">
// Every vocabulary, the platform's and the theatre's own (C-20), with "New vocabulary" for a list
// of the theatre's own.
import { vocabularyInput } from '../../../../../server/vocabularies/input'

definePageMeta({ layout: 'console' })

interface Row { key: string, owner: string, label: string, description: string | null, locked: boolean, live: number, retired: number }

const columns = [
  { key: 'label', label: 'Vocabulary', sortable: true, card: true },
  { key: 'owner', label: 'Belongs to', card: true },
  { key: 'live', label: 'Terms', card: true },
  { key: 'retired', label: 'Retired', card: true },
]
const filters = [{
  name: 'owner',
  label: 'Belongs to',
  primary: true,
  options: [{ value: 'core', label: 'The platform' }, { value: 'theatre', label: 'The theatre' }],
}]
const creating = ref(false)
const fields = [
  { name: 'label', label: 'Name', kind: 'text' as const },
  { name: 'description', label: 'Description', kind: 'textarea' as const, optional: true },
]
const create = (values: Record<string, unknown>) => $fetch<{ key: string }>('/api/core/vocabularies', { method: 'POST', body: { ...values, description: values.description || null } })
const created = (result: unknown) => navigateTo(`/console/system/vocabularies/${encodeURIComponent((result as { key: string }).key)}`)
</script>

<template>
  <PageList
    title="Vocabularies"
    route="/api/core/vocabularies"
    row-key="key"
    :columns="columns"
    :filters="filters"
    :row-label="(row: Row) => row.label"
    :row-to="(row: Row) => `/console/system/vocabularies/${encodeURIComponent(row.key)}`"
    :empty="{ title: 'No vocabularies', description: 'Vocabularies are lists of options, such as production categories, that records choose from.', icon: 'i-lucide-list-tree' }"
  >
    <template #primary>
      <UButton
        label="New vocabulary"
        icon="i-lucide-plus"
        @click="creating = true"
      />
    </template>
    <template #cell-owner="{ row }">
      {{ row.owner === 'theatre' ? 'The theatre' : row.owner }}
    </template>
    <template #cell-label="{ row }">
      <span class="inline-flex items-center gap-2">
        {{ row.label }}
        <UIcon
          v-if="row.locked"
          name="i-lucide-lock"
          class="size-4 text-muted"
          aria-label="Locked"
        />
      </span>
    </template>

    <PageForm
      v-model:open="creating"
      title="New vocabulary"
      description="A list of options of the theatre's own, for forms and records to choose from."
      submit-label="Create vocabulary"
      :schema="vocabularyInput"
      :fields="fields"
      :initial="{ label: '', description: '' }"
      :submit="create"
      @saved="created"
    />
  </PageList>
</template>
