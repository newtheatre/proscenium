<script setup lang="ts">
import { orderMyTiles, saysMembershipSentence } from '#shared/utils/my-summary'
import type { MySummary } from '#shared/utils/my-summary'

definePageMeta({ layout: 'member', middleware: 'signed-in', docs: '/docs/getting-started/your-account' })

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

const { data: summary, error, refresh } = await useAsyncData(
  'my-summary',
  () => request<MySummary>('/api/my/summary'),
  { default: () => EMPTY },
)

const failure = useListFailure(error, 'Your overview could not be read.')

// The order is a fact about the data, not about the template: what is soonest leads (K-127
// criterion 6).
const tiles = computed(() => orderMyTiles(summary.value))

const greeting = computed(() => {
  const name = account.value.user?.name
  const sentence = saysMembershipSentence(summary.value.membership)
  return name ? `You are signed in as ${name}. ${sentence}` : sentence
})
</script>

<template>
  <UContainer
    data-test="my-page"
    :class="MEMBER_PAGE_WIDE"
  >
    <UPageHeader
      title="My NNT"
      :description="failure ? undefined : greeting"
    />

    <ReadFailure
      v-if="failure"
      :failure="failure"
      class="mt-6"
      @retry="refresh()"
    />

    <UPageGrid
      v-else
      :ui="{ base: 'gap-4 mt-6' }"
    >
      <template
        v-for="tile in tiles"
        :key="tile"
      >
        <MyTilesNextShift
          v-if="tile === 'shift'"
          :summary="summary"
        />
        <MyTilesRoomBooking
          v-else-if="tile === 'room'"
          :summary="summary"
        />
        <MyTilesTraining
          v-else-if="tile === 'training'"
          :summary="summary"
        />
        <MyTilesMembership
          v-else-if="tile === 'membership'"
          :summary="summary"
        />
        <MyTilesPasses
          v-else-if="tile === 'passes'"
          :summary="summary"
        />
        <MyTilesNotifications
          v-else-if="tile === 'notifications'"
          :summary="summary"
        />
        <MyTilesNextShow
          v-else
          :summary="summary"
        />
      </template>
    </UPageGrid>
  </UContainer>
</template>
