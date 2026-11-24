<!-- The console home card for sizes on sale whose labels are not all read (core.home-card); left off
     the home while there are none. It lives in app/home-cards, the only folder the home resolves cards
     from. Its button opens Products filtered to those sizes. -->
<script setup lang="ts">
defineProps<{ count?: number }>()
const { t } = useT()
</script>

<template>
  <div class="space-y-3">
    <p class="font-medium">
      {{ t('bar.screens.allergen-card.unchecked', { count: count ?? 0 }) }}
    </p>
    <UButton
      to="/admin/modules/bar/products?allergens=unchecked"
      :label="t('bar.screens.allergen-card.action')"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-arrow-right"
    />
  </div>
</template>
