<!-- The Admin overview's card while maintenance mode is on, so nobody forgets to switch it off (core.home-card). -->
<script setup lang="ts">
const { t } = useT()
</script>

<template>
  <div class="space-y-3">
    <p class="font-medium">
      {{ t('maintenance.card.line') }}
    </p>
    <p class="text-sm text-muted">
      {{ t('maintenance.card.description') }}
    </p>
    <UButton
      to="/admin/modules/maintenance"
      :label="t('maintenance.card.action')"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-arrow-right"
    />
  </div>
</template>
