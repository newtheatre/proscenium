<!-- Wraps data a screen loads. Loading shows the frame at once and a skeleton where data will be.
     A failed first load shows only the reason and Retry, or the way back when a retry cannot help.
     A failed refresh keeps the data on screen and marks it with when it was last good (UI-18). -->
<script setup lang="ts" generic="T">
const props = defineProps<{
  data: T | null | undefined
  status: 'idle' | 'pending' | 'success' | 'error'
  error: unknown
  /** Rows of skeleton while the first load runs. */
  skeletonRows?: number
}>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useT()

const lastGood = ref<Date | null>(props.data != null && props.status !== 'error' ? new Date() : null)
watch(() => [props.status, props.data] as const, ([status, data]) => {
  if (status === 'success' && data != null) lastGood.value = new Date()
})

const hasData = computed(() => props.data !== null && props.data !== undefined)
const failedFirst = computed(() => props.status === 'error' && !hasData.value)
const failedRefresh = computed(() => props.status === 'error' && hasData.value)
const dates = useDates()
const refusal = computed(() => toRefusal(props.error))
const reason = computed(() => refusal.value.reason)
const lastGoodText = computed(() => lastGood.value ? dates.time(lastGood.value) : '')
</script>

<template>
  <div
    class="space-y-4"
    :aria-busy="status === 'pending'"
  >
    <PageFailed
      v-if="failedFirst"
      :reason="reason"
      :status="refusal.status"
      :code="refusal.code"
      :remedy="refusal.remedy"
      :retrying="status === 'pending'"
      @retry="emit('retry')"
    />
    <div
      v-else-if="!hasData"
      class="space-y-3"
      role="status"
    >
      <span class="sr-only">{{ t('core.loading') }}</span>
      <USkeleton
        v-for="n in skeletonRows ?? 5"
        :key="n"
        class="h-10 w-full"
      />
    </div>
    <template v-else>
      <UAlert
        v-if="failedRefresh"
        color="warning"
        icon="i-lucide-wifi-off"
        :title="t('core.failed.stale', { time: lastGoodText })"
        :description="reason"
        :actions="[{ label: t('core.failed.retry'), color: 'neutral', variant: 'outline', onClick: () => emit('retry') }]"
      />
      <slot :data="data as T" />
    </template>
  </div>
</template>
