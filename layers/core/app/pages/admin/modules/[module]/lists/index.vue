<script setup lang="ts">
// A module's Lists tab (Matt, 21 November 2026): the vocabularies the module ships, such as its
// reasons for a refund, beside the thing they are choices for. Opening one shows its terms.
interface Row { key: string, owner: string, label: string, description: string | null, locked: boolean, live: number, retired: number }

const { t } = useT()
const route = useRoute()
const module = computed(() => String(route.params.module))
const { data, status, error, refresh } = await useAPI<{ rows: Row[] }>('/api/core/vocabularies', {
  query: computed(() => ({ owner: module.value, size: 100, sort: 'label' })),
  key: `core:vocabularies:${module.value}`,
})
const line = (row: Row) => [row.description, t('core.counts.terms', { count: row.live })].filter(Boolean).join(' · ')
</script>

<template>
  <PageFrame
    title="Lists"
    description="The choices this module offers in its pickers, such as reasons. Open a list to add, rename, reorder or retire its terms."
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.rows.length"
        icon="i-lucide-list-tree"
        title="No lists"
        description="This module has no lists of its own."
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
          :icon="row.locked ? 'i-lucide-lock' : undefined"
          :to="`/admin/modules/${module}/lists/${encodeURIComponent(row.key)}`"
        />
      </RecordList>
    </DataBoundary>
  </PageFrame>
</template>
