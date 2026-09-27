<script setup lang="ts">
import { MY_THINGS_TO_DO, saysMembershipSentence, splitMyTiles } from '#shared/utils/my-summary'
import type { MySummary } from '#shared/utils/my-summary'

definePageMeta({ layout: 'member', middleware: 'signed-in', docs: '/docs/getting-started/your-account' })

const request = useRequestFetch()
const { account } = useAccount()

const EMPTY: MySummary = {
  onShiftTonight: false,
  shiftIsTonight: false,
  shift: null,
  membership: { state: 'none', until: null, claim: null },
  room: null,
  training: { held: 0, available: 0, nextStep: null, nextSession: null },
  passes: { active: [], request: null },
  ticket: null,
  notifications: [],
  nextShow: null,
}

const { data: summary, error, refresh } = await useAsyncData(
  'my-summary',
  () => request<MySummary>('/api/my/summary'),
  { default: () => EMPTY },
)

const failure = useListFailure(error, 'Your overview could not be read.')

// The order is a fact about the data, not about the template: what is soonest leads, and a tile
// with nothing behind it is a line on one list instead (K-127 criterion 6, issue 1153 item 3).
const split = computed(() => splitMyTiles(summary.value))
const things = computed(() => split.value.things
  .filter((name): name is keyof typeof MY_THINGS_TO_DO => name in MY_THINGS_TO_DO)
  .map(name => ({ name, ...MY_THINGS_TO_DO[name] })))

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
      :ui="MEMBER_PAGE_HEADER"
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
        v-for="tile in split.tiles"
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
        <MyTilesTickets
          v-else-if="tile === 'tickets'"
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

      <UPageCard
        v-if="things.length"
        title="Things you can do"
        class="sm:col-span-2 lg:col-span-3"
        data-test="my-things-to-do"
      >
        <ul class="divide-y divide-default">
          <li
            v-for="thing in things"
            :key="thing.name"
          >
            <ULink
              :to="thing.to"
              class="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm"
              :data-test="`my-thing-${thing.name}`"
            >
              <span class="text-default">{{ thing.says }}</span>
              <span class="font-medium text-primary">{{ thing.label }}</span>
            </ULink>
          </li>
        </ul>
      </UPageCard>
    </UPageGrid>
  </UContainer>
</template>
