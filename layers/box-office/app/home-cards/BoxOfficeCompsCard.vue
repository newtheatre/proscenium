<!-- The console home card for comps requests waiting for a decision this person may make (core.home-card). -->
<script setup lang="ts">
defineProps<{ count?: number }>()
const { t } = useT()
</script>

<template>
  <div class="space-y-3">
    <p class="font-medium">
      {{ t('box-office.home-card.comps', { count: count ?? 0 }) }}
    </p>
    <UButton
      to="/console/box-office/comps"
      :label="t('box-office.home-card.comps-action')"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-arrow-right"
    />
  </div>
</template>
