<script setup lang="ts">
import { lastSyncedLabel } from '#shared/utils/night-shell'

// How old what you are looking at is, in London wall clock (K-102, 0014). Words and an icon, so
// the state is never carried by colour alone (K-101 criterion 3).
const props = defineProps<{
  at?: Date | number | string | null
  busy?: boolean
}>()

const label = computed(() => props.busy ? 'Syncing' : lastSyncedLabel(props.at))
</script>

<template>
  <p
    data-test="night-stale"
    class="flex items-center gap-1.5 font-mono text-xs text-muted"
    aria-live="polite"
  >
    <UIcon
      :name="busy ? 'i-lucide-refresh-cw' : 'i-lucide-clock'"
      class="size-3.5 shrink-0"
    />
    {{ label }}
  </p>
</template>
