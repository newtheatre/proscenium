<!-- The console home card for payments that need someone to settle them (core.home-card). -->
<script setup lang="ts">
defineProps<{ count?: number }>()
const { t } = useT()
</script>

<template>
  <div class="space-y-3">
    <p class="font-medium">
      {{ t('payments.screens.home-card.attention', { count: count ?? 0 }) }}
    </p>
    <UButton
      to="/console/payments/attention"
      :label="t('payments.screens.home-card.attention-action')"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-arrow-right"
    />
  </div>
</template>
