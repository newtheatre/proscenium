<!-- A failed first load shows only the reason and Retry, never a half-filled page. -->
<script setup lang="ts">
defineProps<{ reason: string, retrying?: boolean }>()
defineEmits<{ retry: [] }>()
const { t } = useT()
</script>

<template>
  <UAlert
    role="alert"
    color="error"
    icon="i-lucide-circle-alert"
    :title="reason"
    :actions="[{ label: t('core.failed.retry'), icon: 'i-lucide-refresh-cw', color: 'neutral', variant: 'outline', loading: retrying, onClick: () => $emit('retry') }]"
  />
</template>
