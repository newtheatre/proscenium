<script setup lang="ts">
// Lists of the theatre's own (C-20), with "New list". A list a module ships is on that module's
// Lists tab under Modules, beside what it is a choice for (Matt, 21 November 2026).
import { vocabularyInput } from '../../../../server/vocabularies/input'

interface Row { key: string, owner: string, label: string, description: string | null, locked: boolean, live: number, retired: number }

const { t } = useT()
const { $api } = useNuxtApp()
const { data, status, error, refresh } = await useAPI<{ rows: Row[] }>('/api/core/vocabularies', {
  query: { owner: 'theatre', size: 100, sort: 'label' },
  key: 'core:vocabularies:theatre',
})
const creating = ref(false)
const fields = [
  { name: 'label', label: 'Name', kind: 'text' as const },
  { name: 'description', label: 'Description', kind: 'textarea' as const, optional: true },
]
const create = (values: Record<string, unknown>) => $api<{ key: string }>('/api/core/vocabularies', { method: 'POST', body: { ...values, description: values.description || null } })
const created = (result: unknown) => navigateTo(`/admin/vocabularies/${encodeURIComponent((result as { key: string }).key)}`)
const line = (row: Row) => [row.description, t('core.counts.terms', { count: row.live })].filter(Boolean).join(' · ')
</script>

<template>
  <PageFrame
    title="Lists"
    description="Lists of options of the theatre's own, for forms and records to choose from. The lists a module uses, such as its reasons for a refund, are on that module's page under Modules, on its Lists tab."
    width="reading"
  >
    <template #primary>
      <UButton
        label="New list"
        icon="i-lucide-plus"
        @click="creating = true"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.rows.length"
        icon="i-lucide-list-tree"
        title="No lists of your own yet"
        description="Make one when a form or a record needs its own set of options to choose from."
      />
      <RecordList
        v-else
        label="Lists"
      >
        <RecordListItem
          v-for="row in data.rows"
          :key="row.key"
          :name="row.label"
          :description="line(row)"
          :to="`/admin/vocabularies/${encodeURIComponent(row.key)}`"
        />
      </RecordList>
      <UButton
        label="Modules"
        trailing-icon="i-lucide-arrow-right"
        color="neutral"
        variant="link"
        to="/admin/modules"
        class="px-0"
      />
    </DataBoundary>

    <PageForm
      v-model:open="creating"
      title="New list"
      description="A list of options of the theatre's own, for forms and records to choose from."
      submit-label="Create list"
      :schema="vocabularyInput"
      :fields="fields"
      :initial="{ label: '', description: '' }"
      :submit="create"
      @saved="created"
    />
  </PageFrame>
</template>
