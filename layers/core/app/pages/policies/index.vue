<!-- Every policy this site has, each with a line on what it covers. -->
<script setup lang="ts">
const { t } = useT()
const { data } = await useAPI<{ policies: { id: string, title: string, summary: string | null }[] }>('/api/core/policies', { key: 'core:policies', default: () => ({ policies: [] }) })
useSeoMeta({ title: () => t('core.policies.title'), description: () => t('core.policies.description') })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="t('core.policies.title')"
        :description="t('core.policies.description')"
      />
      <UPageBody>
        <UPageList divide>
          <UPageCard
            v-for="policy in data.policies"
            :key="policy.id"
            :title="policy.title"
            :description="policy.summary ?? undefined"
            :to="`/policies/${policy.id}`"
            variant="ghost"
          />
        </UPageList>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
