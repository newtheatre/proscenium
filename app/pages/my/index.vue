<script setup lang="ts">
import { formatLondon, startOfLondonDay } from '#shared/utils/london'
import type { MySummary } from '#shared/utils/my-summary'

definePageMeta({ layout: 'member', middleware: 'signed-in' })

const request = useRequestFetch()
const { account } = useAccount()

const EMPTY: MySummary = {
  onShiftTonight: false,
  shift: null,
  membership: { state: 'none', until: null, claim: null },
  room: null,
  training: { held: 0, available: 0, nextStep: null, nextSession: null },
  passes: { active: [], request: null },
  notifications: [],
  nextShow: null,
}

const { data: summary, status } = await useAsyncData(
  'my-summary',
  () => request<MySummary>('/api/my/summary'),
  { default: () => EMPTY },
)

const membershipLine = computed(() => {
  const membership = summary.value.membership
  if (membership.state === 'current') return `member until ${formatLondon(startOfLondonDay(membership.until!), { day: 'numeric', month: 'short', year: 'numeric' })}`
  if (membership.state === 'grace') return `in grace until ${formatLondon(startOfLondonDay(membership.until!), { day: 'numeric', month: 'short', year: 'numeric' })}`
  if (membership.state === 'lapsed') return 'membership lapsed'
  return 'no membership on record'
})
</script>

<template>
  <UContainer
    data-test="my-page"
    class="max-w-5xl py-10"
  >
    <UPageHeader
      title="My NNT"
      :description="`${account.user?.name ?? ''}, ${membershipLine}`"
    />

    <UAlert
      v-if="status === 'error'"
      data-test="failure"
      color="error"
      variant="subtle"
      title="Could not load your summary"
      class="mt-6"
    />

    <UPageGrid
      v-else
      :ui="{ base: 'gap-4 mt-6' }"
    >
      <MyTilesNextShift :summary="summary" />
      <MyTilesMembership :summary="summary" />
      <MyTilesTraining :summary="summary" />
      <MyTilesRoomBooking :summary="summary" />
      <MyTilesPasses :summary="summary" />
      <MyTilesNotifications :summary="summary" />
      <MyTilesNextShow :summary="summary" />
      <MyTilesTickets />
    </UPageGrid>
  </UContainer>
</template>
