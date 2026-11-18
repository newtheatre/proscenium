<!-- Console home while access scheme applications or changes wait for a decision (core.home-card),
     so a reviewer sees them without opening the queue. -->
<script setup lang="ts">
defineProps<{ count?: number }>()
const { t } = useT()
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-start gap-2">
      <UIcon
        name="i-lucide-accessibility"
        class="mt-0.5 size-5 shrink-0 text-primary"
      />
      <div>
        <p class="font-medium">
          {{ t('core.access-scheme-waiting-card.title', { count: count ?? 0 }) }}
        </p>
        <p class="text-sm text-muted">
          {{ t('core.access-scheme-waiting-card.description') }}
        </p>
      </div>
    </div>
    <UButton
      to="/console/people/access-scheme"
      :label="t('core.access-scheme-waiting-card.action')"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-arrow-right"
    />
  </div>
</template>
