<script setup lang="ts">
// One number the door reads at arm's length, with the word that says what it is. Colour alone
// never carries the meaning (K-101 criterion 3), so the label is always there.
withDefaults(defineProps<{
  value: string
  of?: string | null
  label: string
  tone?: 'plain' | 'gold' | 'good'
}>(), { tone: 'plain' })
</script>

<template>
  <div class="rounded-xl bg-elevated px-2 py-4 text-center">
    <p class="font-mono text-2xl font-bold tabular-nums">
      <span :class="{ 'text-secondary': tone === 'gold', 'text-success': tone === 'good' }">{{ value }}</span><span
        v-if="of"
        class="text-base text-muted"
      >/{{ of }}</span>
    </p>
    <p class="mt-1 text-xs text-muted">
      {{ label }}
    </p>
  </div>
</template>
