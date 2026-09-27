<script setup lang="ts">
import { saysWhenLong } from '#shared/utils/when'
import { nightCacheKey } from '#shared/utils/night-cache'
import { firstNameOf } from '#shared/utils/night-hub'
import { currentShowNight } from '#shared/utils/show-night'
import { telHref } from '#shared/utils/tonight'
import { EMERGENCY_SERVICES, emergencyCalls, emergencyCardsFor, firstCallOf, saysFirstAiders } from '#shared/utils/venue-emergency'
import type { FirstAider, PinnedCall } from '#shared/utils/venue-emergency'

definePageMeta({ layout: 'tonight', middleware: 'signed-in', docs: '/docs/tonight/emergency' })
useSeoMeta({ title: 'Emergency card' })

interface Card {
  venueId: string
  venueName: string
  address: string | null
  assemblyPoint: string | null
  exits: string | null
  isolationPoints: string | null
  firstAidKit: string | null
  defibrillator: string | null
  firstAiders: string | null
  firePanel: string | null
  what3words: string | null
  notes: string | null
  firstCallName: string | null
  firstCallPhone: string | null
  updatedAt: number | null
  firstAidersTonight: FirstAider[] | null
  // Null: the reader is not on tonight's team at this venue, so no number is theirs (A-114).
  dutyManagers: { name: string, phone: string }[] | null
}

interface Cards { viewerId: string, cards: Card[] }

const request = useRequestFetch()
const { account } = useAccount()

// Rendered into the HTML, so a first-ever visit with no signal still carries the address to read
// out (E-113 criterion 4). A failed read leaves `data` null: the empty state, not a 500.
const { data: served } = await useAsyncData('tonight-emergency', () => request<Cards>('/api/tonight/emergency'), {
  default: () => null as Cards | null,
})

// The same whole-night key `app/layouts/tonight.vue` primes: the device's own last-cached cards
// open the screen with no round trip at all (criterion 2).
const key = nightCacheKey({ screen: 'emergency-cards', night: currentShowNight(), wholeNight: true })
const cache = useNightCache<Cards>(key, () => request<Cards>('/api/tonight/emergency'))

// The served copy until the device has something of its own, then the device's: one is as old as
// this request, the other as old as the last successful one. Its numbers are only its fetcher's.
const cards = computed(() => emergencyCardsFor(cache.data.value ?? served.value, account.value.user?.id ?? null)
  ?.map(card => ({ ...card, firstCall: firstCallOf(card).name })) ?? null)
const asOfAt = computed(() => cache.data.value ? cache.cachedAt.value : Date.now())

// Every venue keeps 999, beside whoever its card rings first (issue 1519, 0106).
const calls = computed(() => emergencyCalls(cards.value ?? []))

// Served as links, so a phone that never runs the script still dials; once it runs, a tap names
// the call in a sheet and only the sheet's own button dials (0106).
const confirming = ref<PinnedCall | null>(null)
const confirmOpen = ref(false)

function confirm(event: MouseEvent, call: PinnedCall): void {
  event.preventDefault()
  confirming.value = call
  confirmOpen.value = true
}

function asOf(at: number): string {
  return saysWhenLong(at)
}

function evacuation(one: Card): string[] {
  return [one.exits, one.assemblyPoint ? `Assembly point: ${one.assemblyPoint}` : null].filter(Boolean) as string[]
}

function firstAid(one: Card): string[] {
  const where = [
    one.firstAidKit ? `Kit: ${one.firstAidKit}` : null,
    one.defibrillator ? `Defibrillator: ${one.defibrillator}` : null,
  ].filter(Boolean) as string[]
  return [...where, ...saysFirstAiders(one.firstAidersTonight, one.firstAiders)]
}

function isolation(one: Card): string[] {
  return [one.isolationPoints, one.firePanel ? `Fire panel: ${one.firePanel}` : null].filter(Boolean) as string[]
}
</script>

<template>
  <NightScreen
    title="Emergency"
    :stale="asOfAt"
    :busy="cache.pending.value && !cards"
  >
    <div class="space-y-4">
      <UAlert
        v-if="cache.error.value && !cards"
        data-test="emergency-failure"
        color="error"
        variant="subtle"
        :description="refusalText(cache.error.value)"
      />

      <template v-else-if="cards?.length">
        <article
          v-for="card in cards"
          :key="card.venueId"
          class="space-y-4"
          :data-test="`emergency-card-${card.venueId}`"
        >
          <h2
            class="nnt-headline text-xl font-bold"
            data-test="emergency-venue"
          >
            {{ card.venueName }}
          </h2>

          <!-- Large display type on a red ground, because this is read aloud under pressure by
               somebody who has never read it before (E-113 criterion 4). -->
          <section
            class="rounded-xl bg-error/10 p-5 ring-1 ring-error/60"
            data-test="emergency-999"
          >
            <h3 class="mb-3 font-mono text-xs tracking-[0.2em] text-error uppercase">
              Read to {{ card.firstCall }}
            </h3>
            <p
              v-if="card.address"
              class="nnt-headline text-3xl leading-tight font-bold"
              data-test="emergency-address"
            >
              {{ card.address }}
            </p>
            <p
              v-else
              class="text-lg text-muted"
              data-test="emergency-no-address"
            >
              No address has been filed for {{ card.venueName }}. Ask the duty manager, and tell the
              front of house officer afterwards.
            </p>
            <p
              v-if="card.what3words"
              class="mt-4 font-mono text-xl"
              data-test="emergency-w3w"
            >
              <span class="text-error">///</span>{{ card.what3words }}
            </p>
          </section>

          <!-- The order to ring in, on the card rather than in anybody's head: the first call is
               pinned under the thumb and this says who follows it (E-113, issue 1150 item 14). -->
          <section
            class="rounded-xl bg-elevated p-4"
            data-test="emergency-duty-manager"
          >
            <h3 class="mb-2 font-semibold">
              After {{ card.firstCall }}
            </h3>
            <p
              class="text-lg"
              data-test="emergency-order"
            >
              Call {{ card.firstCall }} first, then tell the duty manager.
            </p>
            <ul
              v-if="card.dutyManagers?.length"
              class="mt-3 space-y-2"
            >
              <li
                v-for="one in card.dutyManagers"
                :key="one.phone"
                class="flex flex-wrap items-center justify-between gap-3"
              >
                <span class="font-mono text-lg">{{ one.phone }}</span>
                <UButton
                  :to="telHref(one.phone)"
                  color="error"
                  variant="subtle"
                  icon="i-lucide-phone"
                  class="min-h-12"
                  :data-test="`call-duty-manager-${one.phone.replace(/\s+/g, '')}`"
                >
                  Call {{ firstNameOf(one.name) ?? one.name }}
                </UButton>
              </li>
            </ul>
            <p
              v-else-if="card.dutyManagers"
              class="mt-3 text-muted"
              data-test="emergency-no-duty-manager"
            >
              No duty manager has shared a number tonight. Find them in the foyer.
            </p>
          </section>

          <section
            v-if="evacuation(card).length"
            class="rounded-xl bg-elevated p-4"
            data-test="emergency-evacuation"
          >
            <h3 class="mb-2 font-semibold">
              Evacuation
            </h3>
            <p
              v-for="line in evacuation(card)"
              :key="line"
              class="text-lg"
            >
              {{ line }}
            </p>
          </section>

          <section
            v-if="firstAid(card).length"
            class="rounded-xl bg-elevated p-4"
            data-test="emergency-first-aid"
          >
            <h3 class="mb-2 font-semibold">
              First aid
            </h3>
            <p
              v-for="line in firstAid(card)"
              :key="line"
              class="text-lg"
            >
              {{ line }}
            </p>
          </section>

          <section
            v-if="isolation(card).length"
            class="rounded-xl bg-elevated p-4"
            data-test="emergency-isolation"
          >
            <h3 class="mb-2 font-semibold">
              Isolation points
            </h3>
            <p
              v-for="line in isolation(card)"
              :key="line"
              class="text-lg"
            >
              {{ line }}
            </p>
          </section>

          <section
            v-if="card.notes"
            class="rounded-xl bg-elevated p-4"
            data-test="emergency-notes"
          >
            <h3 class="mb-2 font-semibold">
              Notes
            </h3>
            <p class="text-lg">
              {{ card.notes }}
            </p>
          </section>

          <p
            v-if="card.updatedAt"
            data-test="emergency-as-of"
            class="text-center text-sm text-muted"
          >
            Filed {{ asOf(card.updatedAt) }}
          </p>
        </article>
      </template>

      <p
        v-else-if="cards"
        class="text-muted"
        data-test="emergency-no-venue"
      >
        No venue is running tonight, so there is no card to show.
      </p>

      <p
        v-else-if="!cache.pending.value"
        class="text-muted"
      >
        No emergency card is saved on this phone yet, and none could be read just now.
      </p>
    </div>

    <template #actions>
      <NightAction
        v-for="(call, index) in calls"
        :key="call.digits"
        :label="call.label"
        icon="i-lucide-phone-call"
        color="error"
        :variant="index === 0 ? 'solid' : 'outline'"
        :to="call.href"
        :data-test="`emergency-call-${call.digits}`"
        @press="confirm($event, call)"
      />
    </template>

    <!-- Closed without clearing the call, so the dialling link is still there as the tap lands. -->
    <NightSheet
      v-model:open="confirmOpen"
      :title="confirming ? `Call ${confirming.name}?` : ''"
      :primary="confirming ? `Call ${confirming.phone}` : undefined"
      primary-color="error"
      :primary-to="confirming?.href"
      primary-test-id="emergency-call-now"
      @primary="confirmOpen = false"
    >
      <p
        v-if="confirming"
        class="text-lg"
        data-test="emergency-call-says"
      >
        {{ confirming.digits === EMERGENCY_SERVICES.phone
          ? 'This rings 999 from the phone you are holding.'
          : `This rings ${confirming.name} on ${confirming.phone} from the phone you are holding.` }}
        Have the address on the card ready to read.
      </p>
    </NightSheet>
  </NightScreen>
</template>
