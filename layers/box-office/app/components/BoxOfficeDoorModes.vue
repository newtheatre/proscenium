<!-- The door's two ways of letting people in, as tabs over the live door: scanning tickets, and
     counting people with the counter (BO-73). Each is its own page, so the camera stops on Count. -->
<script setup lang="ts">
const props = defineProps<{ performanceId: string, mode: 'scan' | 'count' }>()
const { t } = useT()

const items = computed(() => [
  { label: t('box-office.live-door.modes.scan'), value: 'scan', icon: 'i-lucide-scan-qr-code' },
  { label: t('box-office.live-door.modes.count'), value: 'count', icon: 'i-lucide-users-round' },
])
function go(mode: string | number) {
  if (mode === props.mode) return
  const base = `/live/door/${encodeURIComponent(props.performanceId)}`
  return navigateTo(mode === 'count' ? `${base}/count` : base, { replace: true })
}
</script>

<template>
  <UTabs
    :items="items"
    :model-value="mode"
    :content="false"
    size="lg"
    @update:model-value="go"
  />
</template>
