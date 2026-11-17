<!-- The Admin overview's card while site readiness has items outstanding (core.home-card). -->
<script setup lang="ts">
defineProps<{ count?: number }>()
const { t } = useT()
</script>

<template>
  <div class="space-y-3">
    <p class="font-medium">
      {{ t('public-site.readiness.card.line', { count: count ?? 0 }) }}
    </p>
    <UButton
      to="/admin/site-readiness"
      :label="t('public-site.readiness.card.action')"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-arrow-right"
    />
  </div>
</template>
