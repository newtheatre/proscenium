<!-- Forms' card on My account, shown only to somebody who has started or sent one. -->
<script setup lang="ts">
const props = defineProps<{ headingId: string }>()
const { t } = useT()
const { data } = await useAPI<{ drafts: unknown[], sent: unknown[] }>('/api/forms/mine', { key: 'forms:mine' })
const description = computed(() => {
  const drafts = data.value?.drafts.length ?? 0
  const sent = data.value?.sent.length ?? 0
  return drafts ? t('forms.screens.mine.card-drafts', { count: drafts }) : t('forms.screens.mine.card-sent', { count: sent })
})
</script>

<template>
  <AccountCard
    :heading-id="props.headingId"
    :title="t('forms.navigation.mine.label')"
    :description="description"
    to="/account/forms"
    icon="i-lucide-file-text"
    :status="data?.drafts.length ? { tone: 'warning', label: t('forms.screens.mine.unfinished') } : undefined"
  />
</template>
