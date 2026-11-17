<!-- The access scheme's card on My account (ID-38): where the person's application stands, in a
     word and a line, and the way to the scheme's page. Absent while the scheme is off. -->
<script setup lang="ts">
const props = defineProps<{ headingId: string }>()
const { t } = useT()
const { data } = await useAPI<{ enabled: boolean, name?: string, application?: { status: 'submitted' | 'more-info' | 'accepted' | 'rejected' } | null }>('/api/core/me/access', { key: 'core:my-access-summary' })

const TONE = { 'submitted': 'info', 'more-info': 'warning', 'accepted': 'success', 'rejected': 'danger' } as const
const status = computed(() => data.value?.application?.status ?? null)
const scheme = computed(() => data.value?.name ?? '')
</script>

<template>
  <AccountCard
    v-if="data?.enabled"
    :heading-id="props.headingId"
    :title="scheme"
    :description="status ? t(`core.access.status.${status}.detail`, { scheme }) : t('core.access.intro', { scheme })"
    to="/account/access"
    icon="i-lucide-accessibility"
    :status="status ? { tone: TONE[status], label: t(`core.access.status.${status}`) } : undefined"
  />
</template>
