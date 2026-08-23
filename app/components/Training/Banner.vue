<script lang="ts" setup>
/**
 * Deliberately loud. The one dangerous state this feature can produce is
 * somebody unsure whether they are practising, so the two never look alike.
 */
const { state, busy, refresh, end } = useTrainingMode()

const TARGET_LABEL: Record<string, string> = {
  'bar-till': 'the till',
  'challenge-25': 'Challenge 25',
  'door-scan': 'the door',
}

const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
let poller: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  await refresh()
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  // Polled so a lead closing the register in the training system ends this
  // within a minute, which is the reset the feature promises (docs/14 §9).
  poller = setInterval(refresh, 60_000)
})

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
  if (poller) clearInterval(poller)
})

const remaining = computed(() => {
  if (!state.value.expiresAt) return null
  const left = new Date(state.value.expiresAt).getTime() - now.value
  if (left <= 0) return 'expired'
  const minutes = Math.floor(left / 60_000)
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m left`
  return `${minutes}m left`
})

const tally = computed(() => state.value.events.length)
</script>

<template>
  <div
    v-if="state.active"
    class="sticky top-0 z-50 bg-warning text-inverted"
  >
    <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
      <div class="flex items-center gap-2 min-w-0">
        <UIcon
          name="i-lucide-graduation-cap"
          class="size-5 shrink-0"
        />
        <p class="font-bold text-sm sm:text-base">
          PRACTICE MODE: nothing here is real
        </p>
        <span class="text-xs opacity-90 hidden sm:inline">
          You are practising {{ TARGET_LABEL[state.targetKey ?? ''] ?? 'a screen' }}.
          No money, no stock, no bookings.
        </span>
      </div>

      <div class="flex items-center gap-3 shrink-0">
        <span
          v-if="tally"
          class="text-xs opacity-90"
        >{{ tally }} recorded</span>
        <span
          v-if="remaining"
          class="text-xs font-medium"
        >{{ remaining }}</span>
        <UButton
          label="End practice"
          size="xs"
          color="neutral"
          variant="solid"
          :loading="busy"
          @click="end"
        />
      </div>
    </div>
  </div>
</template>
