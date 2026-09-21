<script setup lang="ts">
import { saysWhen } from '#shared/utils/when'
import type { MySummary } from '#shared/utils/my-summary'

const props = defineProps<{ summary: MySummary }>()

const badgeColor = computed(() => (props.summary.shift?.status === 'CONFIRMED' ? 'success' : 'neutral'))
const badgeLabel = computed(() => (props.summary.shift?.status === 'CONFIRMED' ? 'Confirmed' : 'Claimed'))
</script>

<template>
  <MyTile
    title="Next shift"
    :to="summary.onShiftTonight ? '/tonight' : '/rota'"
    :label="summary.onShiftTonight ? 'Go to tonight' : 'See my rota'"
    :highlight="summary.onShiftTonight"
    :empty="!summary.shift"
    empty-title="No shift claimed"
    empty-label="See open shifts"
    class="lg:col-span-2 sm:col-span-2"
  >
    <p
      v-if="summary.onShiftTonight"
      class="mb-2 text-sm font-medium text-primary"
    >
      On shift tonight
    </p>
    <p class="font-semibold">
      {{ summary.shift?.showTitle }}
    </p>
    <p class="text-sm text-muted">
      {{ summary.shift?.role }} · {{ summary.shift?.venueName }}
    </p>
    <div class="mt-2 flex items-center gap-2">
      <span class="text-sm">{{ summary.shift && saysWhen(summary.shift.startsAt) }}</span>
      <UBadge
        :color="badgeColor"
        variant="subtle"
        size="sm"
      >
        {{ badgeLabel }}
      </UBadge>
    </div>
  </MyTile>
</template>
