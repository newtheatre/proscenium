<!-- Awards' card on My account, shown only to somebody who holds one: what they hold. -->
<script setup lang="ts">
const props = defineProps<{ headingId: string }>()
const { t } = useT()
const { data } = await useAPI<{ awards: { id: string, typeName: string }[] }>('/api/awards/mine', { key: 'awards:mine' })
const names = computed(() => [...new Set((data.value?.awards ?? []).map(a => a.typeName))])
</script>

<template>
  <AccountCard
    :heading-id="props.headingId"
    :title="t('awards.navigation.mine.label')"
    :description="names.length ? names.join(', ') : t('awards.screens.mine.none')"
    to="/account/awards"
    icon="i-lucide-award"
  />
</template>
