<!-- The console home card for a refusals register that has gone past bar.age-check.review-every
     without a signature (core.home-card); absent while it is up to date. -->
<script setup lang="ts">
defineProps<{ count?: number }>()
const { t } = useT()
</script>

<template>
  <div class="space-y-3">
    <p class="font-medium">
      {{ t('bar.screens.register-card.overdue', { count: count ?? 0 }) }}
    </p>
    <UButton
      to="/console/bar/age-checks"
      :label="t('bar.screens.register-card.action')"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-arrow-right"
    />
  </div>
</template>
