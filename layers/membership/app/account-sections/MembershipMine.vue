<!-- Membership's card on My account, on the audience side, so anyone can find how to join (tab 5):
     what the person holds and whether it is current, or an invitation to see what is offered. -->
<script setup lang="ts">
const props = defineProps<{ headingId: string }>()
const { t } = useT()
const { data } = await useAPI<{ memberships: { id: string, schemeName: string, status: string }[] }>('/api/membership/mine', { key: 'membership:mine' })
const current = computed(() => (data.value?.memberships ?? []).filter(m => m.status === 'current' || m.status === 'in-grace'))
const TONE = { 'current': 'success', 'in-grace': 'warning' } as const
const status = computed(() => current.value[0]?.status as keyof typeof TONE | undefined)
</script>

<template>
  <AccountCard
    :heading-id="props.headingId"
    :title="t('membership.navigation.mine.label')"
    :description="current.length ? t('membership.screens.mine.holding', { schemes: current.map(m => m.schemeName).join(', ') }) : t('membership.screens.mine.none')"
    to="/account/membership"
    icon="i-lucide-id-card"
    :status="status ? { tone: TONE[status], label: t(`membership.screens.derived.${status}`) } : undefined"
  />
</template>
