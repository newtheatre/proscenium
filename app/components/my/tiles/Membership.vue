<script setup lang="ts">
import { formatLondon, startOfLondonDay } from '#shared/utils/london'
import type { MySummary } from '#shared/utils/my-summary'

const props = defineProps<{ summary: MySummary }>()

const sayDay = (day: string): string => formatLondon(startOfLondonDay(day), { day: 'numeric', month: 'short', year: 'numeric' })

const word = computed(() => {
  const membership = props.summary.membership
  if (membership.state === 'current') return `Current until ${sayDay(membership.until!)}`
  if (membership.state === 'grace') return `In grace until ${sayDay(membership.until!)}`
  if (membership.state === 'lapsed') return 'Lapsed'
  return 'None recorded'
})

const color = computed(() => {
  const state = props.summary.membership.state
  if (state === 'current') return 'success'
  if (state === 'grace') return 'warning'
  return 'neutral'
})

const claimWord = computed(() => {
  const claim = props.summary.membership.claim
  if (claim === 'open') return 'A claim is under review'
  if (claim === 'declined') return 'Your last claim was declined'
  return null
})
</script>

<template>
  <MyTile
    title="Membership"
    to="/account/membership"
    label="Manage membership"
  >
    <UBadge
      :color="color"
      variant="subtle"
    >
      {{ word }}
    </UBadge>
    <p
      v-if="claimWord"
      class="mt-2 text-sm text-muted"
    >
      {{ claimWord }}
    </p>
  </MyTile>
</template>
