<!-- Every policy this site has, each with a line on what it covers. -->
<script setup lang="ts">
const { t } = useT()
const { data } = await useAPI<{ policies: { id: string, title: string, summary: string | null }[] }>('/api/core/policies', { key: 'core:policies', default: () => ({ policies: [] }) })
useSeoMeta({ title: () => t('core.policies.title'), description: () => t('core.policies.description') })
</script>

<template>
  <PageFrame
    :title="t('core.policies.title')"
    :description="t('core.policies.description')"
  >
    <RecordList
      :label="t('core.policies.title')"
      class="max-w-2xl"
    >
      <RecordListItem
        v-for="policy in data.policies"
        :key="policy.id"
        :name="policy.title"
        :description="policy.summary ?? undefined"
        :to="`/policies/${policy.id}`"
      />
    </RecordList>
  </PageFrame>
</template>
