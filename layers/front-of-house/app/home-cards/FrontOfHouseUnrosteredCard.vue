<!-- The console home card for coming performances with no rota yet (core.home-card); left off the
     home while every one has shifts. -->
<script setup lang="ts">
defineProps<{ count?: number }>()
const { t } = useT()
</script>

<template>
  <div class="space-y-3">
    <p class="font-medium">
      {{ t('front-of-house.home-card.unrostered', { count: count ?? 0 }) }}
    </p>
    <UButton
      to="/console/front-of-house/rota?unfilled=1"
      :label="t('front-of-house.home-card.unrostered-action')"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-arrow-right"
    />
  </div>
</template>
