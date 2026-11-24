<!-- The strip above the till's panels: which session sales go into, or that one opens with the first
     sale, and where, the place being remembered on this device. On a phone it is one line, with the
     place and the session in its menu. The `link` slot draws the linked-tills menu in both. -->
<script setup lang="ts">
defineProps<{
  live?: boolean
  /** When the open session began; null while the session waits for the first sale. */
  since: number | null
  place: string | null
  /** A payment is being taken, so the place cannot move. */
  locked: boolean
}>()
const emit = defineEmits<{ move: [spaceId: string | null] }>()
defineSlots<{ link?: (props: { compact: boolean, testid: string }) => unknown }>()
const { t } = useT()
const { time } = useDates()
</script>

<template>
  <div class="mb-4 flex items-center gap-2 text-sm text-muted sm:hidden">
    <UIcon
      name="i-lucide-clock"
      class="size-4 shrink-0"
    />
    <span class="min-w-0 flex-1 truncate">{{ since !== null ? t('payments.screens.till.session-since-short', { time: time(since) }) : t('payments.screens.till.session-opens-short') }}</span>
    <slot
      name="link"
      :compact="true"
      testid="till-sync"
    />
    <UPopover>
      <IconButton
        icon="i-lucide-map-pin"
        :label="t('payments.screens.till.session-menu')"
      />
      <template #content>
        <div class="w-72 space-y-3 p-3">
          <PaymentsSessionPlace
            :model-value="place"
            :disabled="locked"
            class="w-full"
            @update:model-value="emit('move', $event)"
          />
          <UButton
            to="/console/payments/sessions"
            color="neutral"
            variant="ghost"
            block
            trailing-icon="i-lucide-arrow-right"
            :label="t('payments.screens.till.your-session')"
          />
        </div>
      </template>
    </UPopover>
  </div>
  <div
    class="mb-6 hidden flex-wrap items-center gap-x-3 gap-y-2 text-muted sm:flex"
    :class="live ? 'text-base' : 'text-sm'"
  >
    <span v-if="since !== null">{{ t('payments.screens.till.session-since', { time: time(since) }) }}</span>
    <span v-else>{{ t('payments.screens.till.session-opens') }}</span>
    <div class="w-64 max-w-full">
      <PaymentsSessionPlace
        :model-value="place"
        :disabled="locked"
        @update:model-value="emit('move', $event)"
      />
    </div>
    <slot
      name="link"
      :compact="false"
      testid="till-sync-wide"
    />
    <UButton
      to="/console/payments/sessions"
      color="neutral"
      variant="ghost"
      :size="live ? 'xl' : 'md'"
      trailing-icon="i-lucide-arrow-right"
      class="ms-auto"
      :label="t('payments.screens.till.your-session')"
    />
  </div>
</template>
