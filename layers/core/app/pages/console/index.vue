<!-- Console home. A queue of what is waiting arrives with the home page type; until modules
     contribute cards this says so and offers where to start. -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })
const { t } = useT()
</script>

<template>
  <PageFrame :title="t('core.console.home.title')">
    <EmptyState
      :title="t('core.console.home.empty.title')"
      :description="t('core.console.home.empty.description')"
      icon="i-lucide-circle-check"
    />
  </PageFrame>
</template>
