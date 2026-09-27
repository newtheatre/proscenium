<script setup lang="ts">
import { isNightRole } from '#shared/utils/night-authority'
import { saysShiftRole, saysShiftStatus } from '#shared/utils/rota'
import { saysWhen } from '#shared/utils/when'
import type { ShiftStatus } from '#shared/utils/rota'
import type { MySummary } from '#shared/utils/my-summary'

const props = defineProps<{ summary: MySummary }>()

const status = computed(() => props.summary.shift?.status)
const badgeColor = computed(() => (status.value === 'CONFIRMED' ? 'success' : status.value === 'DECLINED' ? 'error' : 'neutral'))
// A claim opens nothing until an officer confirms it, so it says so rather than reading as a shift (0094).
const badgeLabel = computed(() => {
  if (status.value === 'CLAIMED') return 'Claimed, waiting to be confirmed'
  return status.value ? saysShiftStatus(status.value as ShiftStatus) : ''
})
// The rota's value is never shown: `DUTY_MANAGER` is a column, not something a member reads.
const roleWords = computed(() => {
  const role = props.summary.shift?.role
  return role && isNightRole(role) ? saysShiftRole(role) : ''
})
// On shift, and this shift being tonight's: a bar opening tonight never lights next week's show.
const onThisShift = computed(() => props.summary.onShiftTonight && props.summary.shiftIsTonight)
</script>

<template>
  <MyTile
    title="Next shift"
    :to="summary.onShiftTonight ? '/tonight' : '/rota'"
    :label="summary.onShiftTonight ? 'Go to tonight' : 'See my rota'"
    :highlight="summary.onShiftTonight"
    class="lg:col-span-2 sm:col-span-2"
  >
    <p
      v-if="!summary.shift"
      class="font-semibold"
    >
      On shift at the bar tonight
    </p>
    <template v-else>
      <p
        v-if="onThisShift"
        class="mb-2 text-sm font-medium text-primary"
      >
        On shift tonight
      </p>
      <p class="font-semibold">
        {{ summary.shift.showTitle }}
      </p>
      <p class="text-sm text-muted">
        {{ roleWords }} · {{ summary.shift.venueName }}
      </p>
      <div class="mt-2 flex items-center gap-2">
        <span class="text-sm">{{ saysWhen(summary.shift.startsAt) }}</span>
        <UBadge
          :color="badgeColor"
          variant="subtle"
          size="sm"
        >
          {{ badgeLabel }}
        </UBadge>
      </div>
    </template>
  </MyTile>
</template>
