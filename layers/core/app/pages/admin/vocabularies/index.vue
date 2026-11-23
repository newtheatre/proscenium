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
  { name: 'label', label: t('core.lists.name'), kind: 'text' as const },
  { name: 'description', label: t('core.lists.field-description'), kind: 'textarea' as const, optional: true },
]
const create = (values: Record<string, unknown>) => $api<{ key: string }>('/api/core/vocabularies', { method: 'POST', body: { ...values, description: values.description || null } })
const created = (result: unknown) => navigateTo(`/admin/vocabularies/${encodeURIComponent((result as { key: string }).key)}`)
const line = (row: Row) => [row.description, t('core.counts.terms', { count: row.live })].filter(Boolean).join(' · ')
</script>

<template>
  <PageFrame
    :title="t('core.lists.lists')"
    :description="t('core.lists.description-lists-of-options')"
    width="reading"
  >
    <template #primary>
      <UButton
        :label="t('core.lists.new-list')"
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
        :title="t('core.lists.title-no-lists-of')"
        :description="t('core.lists.description-make-one-when')"
      />
      <RecordList
        v-else
        :label="t('core.lists.lists')"
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
        :label="t('core.lists.modules')"
        trailing-icon="i-lucide-arrow-right"
        color="neutral"
        variant="link"
        to="/admin/modules"
        class="px-0"
      />
    </DataBoundary>

    <PageForm
      v-model:open="creating"
      :title="t('core.lists.new-list')"
      :description="t('core.lists.description-a-list-of')"
      :submit-label="t('core.lists.create-list')"
      :schema="vocabularyInput"
      :fields="fields"
      :initial="{ label: '', description: '' }"
      :submit="create"
      @saved="created"
    />
  </PageFrame>
</template>
