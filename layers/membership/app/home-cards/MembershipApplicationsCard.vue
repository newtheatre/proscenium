<!-- The console home card for applications waiting on staff (tab 4, core.home-card). -->
<script setup lang="ts">
defineProps<{ count?: number }>()
const { t } = useT()
</script>

<template>
  <div class="space-y-3">
    <p class="font-medium">
      {{ t('membership.screens.home-card.applications', { count: count ?? 0 }) }}
    </p>
    <UButton
      to="/console/membership#waiting"
      :label="t('membership.screens.home-card.applications-action')"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-arrow-right"
    />
  </div>
</template>
