<!-- Forms' card on My account, shown only to somebody who has started or sent one. -->
<script setup lang="ts">
const props = defineProps<{ headingId: string }>()
const { t } = useT()
const { data } = await useAPI<{ drafts: unknown[], sent: unknown[], reviews: { status: string }[] }>('/api/forms/mine', { key: 'forms:mine' })
const waiting = computed(() => data.value?.reviews.filter(r => r.status === 'assigned').length ?? 0)
const description = computed(() => {
  const drafts = data.value?.drafts.length ?? 0
  const sent = data.value?.sent.length ?? 0
  if (waiting.value) return t('forms.screens.mine.card-reviews', { count: waiting.value })
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
    :status="waiting ? { tone: 'warning', label: t('forms.screens.mine.to-review') } : data?.drafts.length ? { tone: 'warning', label: t('forms.screens.mine.unfinished') } : undefined"
  />
</template>
