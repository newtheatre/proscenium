<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import { nightCacheKey } from '#shared/utils/night-cache'
import { currentShowNight } from '#shared/utils/show-night'

definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Emergency card' })

interface Card {
  venueName: string
  assemblyPoint: string | null
  exits: string | null
  isolationPoints: string | null
  what3words: string | null
  notes: string | null
  updatedAt: number
}

const request = useRequestFetch()

// The same whole-night key `app/layouts/tonight.vue` primes: the device's own last-cached card
// opens the screen with no round trip at all (criterion 2).
const key = nightCacheKey({ screen: 'emergency-card', night: currentShowNight(), wholeNight: true })
const cache = useNightCache<Card>(key, () => request<Card>('/api/tonight/emergency'))

function asOf(at: number): string {
  return formatLondon(new Date(at * 1000), { dateStyle: 'long', timeStyle: 'short' })
}
</script>

<template>
  <NightScreen
    title="Emergency card"
    :stale="cache.cachedAt.value"
    :busy="cache.pending.value"
  >
    <div class="text-lg">
      <UAlert
        v-if="cache.error.value && !cache.data.value"
        data-test="emergency-failure"
        color="error"
        variant="subtle"
        :description="refusalText(cache.error.value)"
      />

      <div
        v-else-if="cache.data.value"
        class="space-y-6"
        data-test="emergency-card"
      >
        <p
          data-test="emergency-as-of"
          class="text-sm text-muted"
        >
          As of {{ asOf(cache.data.value.updatedAt) }}
        </p>

        <section
          v-if="cache.data.value.assemblyPoint"
          data-test="emergency-assembly"
        >
          <h2 class="text-sm font-semibold text-muted uppercase">
            Assembly point
          </h2>
          <p class="font-bold">
            {{ cache.data.value.assemblyPoint }}
          </p>
        </section>

        <section
          v-if="cache.data.value.exits"
          data-test="emergency-exits"
        >
          <h2 class="text-sm font-semibold text-muted uppercase">
            Exits
          </h2>
          <p class="font-bold">
            {{ cache.data.value.exits }}
          </p>
        </section>

        <section
          v-if="cache.data.value.isolationPoints"
          data-test="emergency-isolation"
        >
          <h2 class="text-sm font-semibold text-muted uppercase">
            Isolation points
          </h2>
          <p class="font-bold">
            {{ cache.data.value.isolationPoints }}
          </p>
        </section>

        <section
          v-if="cache.data.value.what3words"
          data-test="emergency-w3w"
        >
          <h2 class="text-sm font-semibold text-muted uppercase">
            what3words
          </h2>
          <p class="font-bold">
            {{ cache.data.value.what3words }}
          </p>
        </section>

        <section
          v-if="cache.data.value.notes"
          data-test="emergency-notes"
        >
          <h2 class="text-sm font-semibold text-muted uppercase">
            Notes
          </h2>
          <p>{{ cache.data.value.notes }}</p>
        </section>
      </div>

      <p
        v-else-if="!cache.pending.value"
        class="text-muted"
      >
        No emergency card is cached on this device yet, and none could be read just now.
      </p>
    </div>
  </NightScreen>
</template>
