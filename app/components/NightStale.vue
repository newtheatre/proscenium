<script setup lang="ts">
import { NIGHT_STALE_AFTER_MS, lastSyncedLabel, nightFreshness, staleAnnouncement } from '#shared/utils/night-shell'
import type { NightFreshness } from '#shared/utils/night-shell'

// How old what you are looking at is, in London wall clock (K-102, 0014). Words and an icon, so
// the state is never carried by colour alone (K-101 criterion 3).
const props = defineProps<{
  at?: Date | number | string | null
  busy?: boolean
}>()

const label = computed(() => props.busy ? 'Syncing' : lastSyncedLabel(props.at))

// The label moves every time the screen refreshes, so it carries no live region: a screen reader
// would read the clock out over and over. Only the change from fresh to stale is announced.
const now = ref(Date.now())
const announcement = ref('')
let ticking: ReturnType<typeof setInterval> | undefined

const freshness = computed<NightFreshness>(() => nightFreshness(props.at, now.value))

watch(freshness, (state, was) => {
  if (was !== undefined && state !== was) announcement.value = staleAnnouncement(state)
})

onMounted(() => {
  ticking = setInterval(() => {
    now.value = Date.now()
  }, NIGHT_STALE_AFTER_MS / 4)
})
onUnmounted(() => {
  if (ticking) clearInterval(ticking)
})
</script>

<template>
  <div class="flex items-center gap-1.5">
    <p
      data-test="night-stale"
      class="flex items-center gap-1.5 font-mono text-xs text-muted"
    >
      <UIcon
        :name="busy ? 'i-lucide-refresh-cw' : 'i-lucide-clock'"
        class="size-3.5 shrink-0"
      />
      {{ label }}
    </p>
    <p
      class="sr-only"
      aria-live="polite"
      data-test="night-stale-announcement"
    >
      {{ announcement }}
    </p>
  </div>
</template>
