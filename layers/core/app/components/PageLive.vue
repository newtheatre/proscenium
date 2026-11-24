<!-- The Live page type (UI-05): one job, done standing up. A thin status strip says what this screen
     is, which performance, whether the device can reach the server, and the way out; the page's own
     task fills the rest. Leaving a screen goes back to the Tonight hub; leaving the hub (a worded
     "Leave" button) goes back to where the person works sitting down. A screen that works offline keeps a device copy of its data
     (useLiveData) and queues its writes (useLiveQueue); the strip says how many are waiting to be sent.
     To someone a training course opens it to, the strip offers "Practise this screen" (PM-12). -->
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

// In practice the hub is the framed one, and leaving is the panel's Leave practice, so the hub has no exit of its own.
const { framed } = usePractising()
const practise = usePractiseThisScreen()
const hub = computed(() => framed.value ? '/practice/live' : '/live')
const out = computed(() => {
  if (props.back) return { to: props.back, label: t('core.live.back'), leaves: false }
  if (useRoute().path.replace(/\/$/, '') !== hub.value) return { to: hub.value, label: t('core.live.back'), leaves: false }
  if (framed.value) return null
  const to = has('console') ? '/console' : has('members') ? '/members' : '/account'
  return { to, label: t('core.live.leave'), leaves: true }
})
</script>

<template>
  <div class="flex min-h-full flex-1 flex-col">
    <!-- The strip lines up with the page below it and stands as tall as the console's navbar. Going
         back is at the start, as a trail's back is; leaving live mode is an exit, so it sits at the end. -->
    <header class="sticky top-[var(--practice-banner,0px)] z-10 flex min-h-(--ui-header-height) items-center gap-3 border-b border-default bg-elevated px-4 py-2 sm:px-6">
      <IconButton
        v-if="out && !out.leaves"
        :to="out.to"
        icon="i-lucide-arrow-left"
        size="xl"
        :label="out.label"
        class="-ms-2"
      />
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-lg font-semibold text-highlighted">
          {{ title }}
        </h1>
        <p
          v-if="context"
          class="line-clamp-2 text-sm text-pretty text-muted"
        >
          {{ context }}
        </p>
      </div>
      <IconButton
        v-if="practise"
        :to="practise"
        icon="i-lucide-graduation-cap"
        size="xl"
        :label="t('core.practice.practise-screen')"
      />
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
      <!-- Worded, because an icon alone is easy to miss on a phone. -->
      <UButton
        v-if="out?.leaves"
        :to="out.to"
        icon="i-lucide-log-out"
        color="neutral"
        variant="ghost"
        :label="t('core.live.leave-short')"
        :aria-label="out.label"
        class="-me-2"
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
