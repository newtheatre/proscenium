<!-- A failed first load shows only the reason and Retry, never a half-filled page. -->
<script setup lang="ts">
defineProps<{ reason: string, retrying?: boolean }>()
defineEmits<{ retry: [] }>()
const { t } = useT()
</script>

<template>
  <div
    class="flex flex-col items-start gap-3 rounded-lg border border-default p-6"
    role="alert"
  >
    <p class="font-medium text-highlighted">
      {{ reason }}
    </p>
    <UButton
      :label="t('core.failed.retry')"
      icon="i-lucide-refresh-cw"
      :loading="retrying"
      @click="$emit('retry')"
    />
  </div>
</template>
