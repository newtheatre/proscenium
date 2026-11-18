<!-- The Live page type (UI-05): one job, done standing up. A thin status strip says what this screen
     is, which performance, whether the device can reach the server, and the way out; the page's own
     task fills the rest. Leaving a screen goes back to the Tonight hub; leaving the hub goes back to
     where the person works sitting down. A screen that works offline keeps a device copy of its data
     (useLiveData) and queues its writes (useLiveQueue); the strip says how many are waiting to be sent. -->
<script setup lang="ts">
import { useOnline } from '@vueuse/core'

const props = defineProps<{
  /** What this screen is, already translated. */
  title: string
  /** Which performance, or other context, already translated. */
  context?: string
  /** Where "leave" goes; the Tonight hub by default. */
  back?: string
}>()

const { t } = useT()
const { has } = useViewer()
const online = useOnline()
const waiting = useLiveWaiting()
useHead({ title: () => props.context ? `${props.title}: ${props.context}` : props.title })

const hub = '/live'
const out = computed(() => {
  if (props.back) return { to: props.back, label: t('core.live.back') }
  if (useRoute().path.replace(/\/$/, '') !== hub) return { to: hub, label: t('core.live.back') }
  const to = has('console') ? '/console' : has('members') ? '/members' : '/account'
  return { to, label: t('core.live.leave') }
})
</script>

<template>
  <div class="flex min-h-full flex-1 flex-col">
    <header class="sticky top-0 z-10 flex items-center gap-3 border-b border-default bg-elevated px-3 py-1">
      <IconButton
        :to="out.to"
        icon="i-lucide-arrow-left"
        size="xl"
        :label="out.label"
      />
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-lg font-semibold text-highlighted">
          {{ title }}
        </h1>
        <p
          v-if="context"
          class="truncate text-sm text-muted"
        >
          {{ context }}
        </p>
      </div>
      <UBadge
        v-if="waiting"
        color="warning"
        variant="subtle"
        size="lg"
        icon="i-lucide-cloud-upload"
        :label="t('core.live.waiting', { count: waiting })"
      />
      <UBadge
        :color="online ? 'success' : 'warning'"
        variant="subtle"
        size="lg"
        :icon="online ? 'i-lucide-wifi' : 'i-lucide-wifi-off'"
        :label="online ? t('core.live.online') : t('core.live.offline')"
        role="status"
      />
    </header>
    <UAlert
      v-if="!online"
      color="warning"
      variant="subtle"
      icon="i-lucide-wifi-off"
      :title="t('core.live.offline-title')"
      :description="t('core.live.offline-description')"
      class="rounded-none"
    />
    <div class="flex-1 p-4 sm:p-6">
      <slot />
    </div>
    <footer
      v-if="$slots.footer"
      class="sticky bottom-0 border-t border-default bg-elevated p-3"
    >
      <slot name="footer" />
    </footer>
  </div>
</template>
