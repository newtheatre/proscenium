<!-- Raised against target as a bar and in words (K1); with no target, the words alone. -->
<script setup lang="ts">
defineProps<{ progress: { raisedMinor: number, targetMinor: number | null, currency: string } }>()
const text = useCampaignText()
</script>

<template>
  <div class="space-y-2">
    <UProgress
      v-if="text.percent(progress) !== null"
      :model-value="text.percent(progress)!"
      :aria-label="text.raised(progress)"
    />
    <p class="font-medium">
      {{ text.raised(progress) }}
    </p>
  </div>
</template>
