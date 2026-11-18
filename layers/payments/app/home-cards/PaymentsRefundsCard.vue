<!-- The console home card for refunds waiting for someone who may approve them (core.home-card). -->
<script setup lang="ts">
defineProps<{ count?: number }>()
const { t } = useT()
</script>

<template>
  <div class="space-y-3">
    <p class="font-medium">
      {{ t('payments.screens.home-card.refunds', { count: count ?? 0 }) }}
    </p>
    <UButton
      to="/console/payments/refunds"
      :label="t('payments.screens.home-card.refunds-action')"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-arrow-right"
    />
  </div>
</template>
