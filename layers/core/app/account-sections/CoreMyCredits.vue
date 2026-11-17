<!-- "Your credits" as a card on the members' side: how many productions credit the person, and the
     way to choose who sees each. Absent for someone with no credits. -->
<script setup lang="ts">
const props = defineProps<{ headingId: string }>()
const { t } = useT()
const { data } = await useAPI<{ credits: { id: string }[] }>('/api/core/me/credits', { key: 'core:my-credits-summary' })
const count = computed(() => data.value?.credits.length ?? 0)
</script>

<template>
  <AccountCard
    v-if="count"
    :heading-id="props.headingId"
    :title="t('core.me.credits.title')"
    :description="t('core.me.credits.summary', { count })"
    to="/account/credits"
    icon="i-lucide-scroll-text"
  />
</template>
