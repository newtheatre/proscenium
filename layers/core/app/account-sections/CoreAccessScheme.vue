<!-- The access scheme's section of My account (ID-38): where the person's application stands, in a
     line, and the way to the scheme's page. Absent while the scheme is off. -->
<script setup lang="ts">
const props = defineProps<{ headingId: string }>()
const { t } = useT()
const { data } = await useFetch<{ enabled: boolean, name?: string, application?: { status: 'submitted' | 'more-info' | 'accepted' | 'rejected' } | null }>('/api/core/me/access', { key: 'core:my-access-summary' })

const TONE = { 'submitted': 'info', 'more-info': 'warning', 'accepted': 'success', 'rejected': 'danger' } as const
const status = computed(() => data.value?.application?.status ?? null)
</script>

<template>
  <div
    v-if="data?.enabled"
    class="space-y-3"
  >
    <h2
      :id="props.headingId"
      class="text-lg font-semibold text-highlighted"
    >
      {{ data.name }}
    </h2>
    <StatusBadge
      v-if="status"
      :tone="TONE[status]"
      :label="t(`core.access.status.${status}`)"
    />
    <p v-else>
      {{ t('core.access.intro', { scheme: data.name ?? '' }) }}
    </p>
    <UButton
      to="/account/access"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-arrow-right"
      :label="status ? t('core.access.open') : t('core.access.apply')"
    />
  </div>
</template>
