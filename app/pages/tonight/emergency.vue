<script setup lang="ts">
import { saysWhenLong } from '#shared/utils/when'
import { nightCacheKey } from '#shared/utils/night-cache'
import { firstNameOf } from '#shared/utils/night-hub'
import { currentShowNight } from '#shared/utils/show-night'

definePageMeta({ layout: 'tonight', docs: '/docs/tonight/emergency' })
useSeoMeta({ title: 'Emergency card' })

interface Card {
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
  updatedAt: number
  dutyManagers?: { name: string, phone: string }[]
}

const request = useRequestFetch()

// Rendered into the HTML, so a first-ever visit with no signal still carries the address to read
// out (E-113 criterion 4). No card and no shift both leave `data` null: the empty state, not a 500.
const { data: served } = await useAsyncData('tonight-emergency', () => request<Card>('/api/tonight/emergency'), {
  default: () => null as Card | null,
})

// The same whole-night key `app/layouts/tonight.vue` primes: the device's own last-cached card
// opens the screen with no round trip at all (criterion 2).
const key = nightCacheKey({ screen: 'emergency-card', night: currentShowNight(), wholeNight: true })
const cache = useNightCache<Card>(key, () => request<Card>('/api/tonight/emergency'))

// The served copy until the device has something of its own, then the device's: one is as old as
// this request, the other as old as the last successful one, and the screen says which.
const card = computed(() => cache.data.value ?? served.value)
const asOfAt = computed(() => cache.data.value ? cache.cachedAt.value : Date.now())

function asOf(at: number): string {
  return saysWhenLong(at)
}

const evacuation = computed(() => {
  const one = card.value
  if (!one) return []
  return [one.exits, one.assemblyPoint ? `Assembly point: ${one.assemblyPoint}` : null].filter(Boolean) as string[]
})

const firstAid = computed(() => {
  const one = card.value
  if (!one) return []
  return [
    one.firstAidKit ? `Kit: ${one.firstAidKit}` : null,
    one.defibrillator ? `Defibrillator: ${one.defibrillator}` : null,
    one.firstAiders ? `First aiders tonight: ${one.firstAiders}` : null,
  ].filter(Boolean) as string[]
})

// Optional on the type: a cached card need not carry the list, and the screen opens all the
// same (E-113 criterion 2).
const dutyManagers = computed(() => card.value?.dutyManagers ?? [])

const isolation = computed(() => {
  const one = card.value
  if (!one) return []
  return [one.isolationPoints, one.firePanel ? `Fire panel: ${one.firePanel}` : null].filter(Boolean) as string[]
})
</script>

<template>
  <NightScreen
    title="Emergency"
    :stale="asOfAt"
    :busy="cache.pending.value && !card"
  >
    <div class="space-y-4">
      <UAlert
        v-if="cache.error.value && !card"
        data-test="emergency-failure"
        color="error"
        variant="subtle"
        :description="refusalText(cache.error.value)"
      />

      <template v-else-if="card">
        <!-- Large display type on a red ground, because this is read aloud under pressure by
             somebody who has never read it before (E-113 criterion 4). -->
        <section
          class="rounded-xl bg-error/10 p-5 ring-1 ring-error/60"
          data-test="emergency-999"
        >
          <h2 class="mb-3 font-mono text-xs tracking-[0.2em] text-error uppercase">
            Read to 999
          </h2>
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

        <!-- The order to ring in, on the card rather than in anybody's head: 999 is pinned under
             the thumb and this says who follows it (E-113, issue 1150 item 14). -->
        <section
          class="rounded-xl bg-elevated p-4"
          data-test="emergency-duty-manager"
        >
          <h2 class="mb-2 font-semibold">
            After 999
          </h2>
          <p class="text-lg">
            Call 999 first, then tell the duty manager.
          </p>
          <ul
            v-if="dutyManagers.length"
            class="mt-3 space-y-2"
          >
            <li
              v-for="one in dutyManagers"
              :key="one.phone"
              class="flex flex-wrap items-center justify-between gap-3"
            >
              <span class="font-mono text-lg">{{ one.phone }}</span>
              <UButton
                :to="`tel:${one.phone}`"
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
            v-else
            class="mt-3 text-muted"
            data-test="emergency-no-duty-manager"
          >
            No duty manager has shared a number tonight. Find them in the foyer.
          </p>
        </section>

        <section
          v-if="evacuation.length"
          class="rounded-xl bg-elevated p-4"
          data-test="emergency-evacuation"
        >
          <h2 class="mb-2 font-semibold">
            Evacuation
          </h2>
          <p
            v-for="line in evacuation"
            :key="line"
            class="text-lg"
          >
            {{ line }}
          </p>
        </section>

        <section
          v-if="firstAid.length"
          class="rounded-xl bg-elevated p-4"
          data-test="emergency-first-aid"
        >
          <h2 class="mb-2 font-semibold">
            First aid
          </h2>
          <p
            v-for="line in firstAid"
            :key="line"
            class="text-lg"
          >
            {{ line }}
          </p>
        </section>

        <section
          v-if="isolation.length"
          class="rounded-xl bg-elevated p-4"
          data-test="emergency-isolation"
        >
          <h2 class="mb-2 font-semibold">
            Isolation points
          </h2>
          <p
            v-for="line in isolation"
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
          <h2 class="mb-2 font-semibold">
            Notes
          </h2>
          <p class="text-lg">
            {{ card.notes }}
          </p>
        </section>

        <p
          data-test="emergency-as-of"
          class="text-center text-sm text-muted"
        >
          Filed {{ asOf(card.updatedAt) }}
        </p>
      </template>

      <p
        v-else-if="!cache.pending.value"
        class="text-muted"
      >
        No emergency card is saved on this phone yet, and none could be read just now.
      </p>
    </div>

    <template #actions>
      <NightAction
        label="Call 999"
        icon="i-lucide-phone-call"
        color="error"
        to="tel:999"
      />
    </template>
  </NightScreen>
</template>
