<!-- The Tonight hub: tonight's performances, each with its start time and the figures other modules
     give for it (core.tonight-figure), read again while the hub is open (on a dark day, when the next
     performance is), then the live screens this
     person may open, one large tile each. Each performance says when latecomers are let in. The tiles are the live menu's entries (core.navigation with
     menu 'live'), so a module that brings live screens adds its own tile and nothing here names a
     module. Performances are those of the operating day, so a late show stays past midnight. -->
<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'

interface Figure { id: string, label: string, value: string | number | null, state: 'ok' | 'attention' | 'unavailable', unit?: string, to?: string }
interface Performance { id: string, title: string, label: string | null, startsAt: number, venue: string, latecomers?: string, figures: Figure[] }

const REFRESH = 30_000 // not-policy: how often the figures are read again

const { t, te } = useT()
const { time, dayBrief } = useDates()
const { money, isCurrency } = useMoneyText()
const { data: navigation } = await useNavigation('live')
const tiles = computed(() => navigation.value?.items ?? [])
const { data: tonight, refresh } = await useAPI<{ performances: Performance[], next?: { title: string, label: string | null, startsAt: number, venue: string } | null }>('/api/core/live/tonight', { key: 'core:live:tonight', default: () => ({ performances: [], next: null }) })
// The figures move all night (sold, in, still to come), so the hub reads them again while open.
useIntervalFn(() => { void refresh() }, REFRESH)
const performances = computed(() => tonight.value?.performances ?? [])
const next = computed(() => tonight.value?.next ?? null)

// A label is translated when the catalogue has it; a value whose unit is a currency is money in minor units.
const labelOf = (text: string) => (te(text) ? t(text) : text)
function valueOf(f: Figure): string {
  if (f.value === null || f.state === 'unavailable') return t('core.live.figure-unavailable')
  if (typeof f.value === 'number' && isCurrency(f.unit)) return money(f.value, f.unit)
  return f.unit ? `${f.value} ${f.unit}` : String(f.value)
}
</script>

<template>
  <PageLive :title="t('core.live.title')">
    <div class="flex flex-col gap-6">
      <section
        v-if="tiles.length"
        aria-labelledby="tonight-performances"
        class="flex flex-col gap-3"
      >
        <h2
          id="tonight-performances"
          class="text-sm font-semibold text-muted"
        >
          {{ t('core.live.performances') }}
        </h2>
        <ul
          v-if="performances.length"
          class="grid grid-cols-1 gap-3 lg:grid-cols-2"
        >
          <li
            v-for="p in performances"
            :key="p.id"
            class="flex flex-col gap-3 rounded-lg border border-default p-4"
          >
            <div class="flex items-baseline justify-between gap-3">
              <span class="flex min-w-0 flex-col">
                <strong class="truncate text-lg">{{ [p.title, p.label].filter(Boolean).join(', ') }}</strong>
                <span class="text-sm text-muted">{{ p.venue }}</span>
              </span>
              <span class="shrink-0 text-2xl font-semibold tabular-nums">{{ time(p.startsAt) }}</span>
            </div>
            <LatecomersNote
              v-if="p.latecomers"
              :rule="p.latecomers"
              staff
            />
            <dl
              v-if="p.figures.length"
              class="grid grid-cols-3 gap-2"
            >
              <div
                v-for="f in p.figures"
                :key="f.id"
                class="flex flex-col"
              >
                <dt class="text-xs text-muted">
                  {{ labelOf(f.label) }}
                </dt>
                <dd
                  class="text-xl font-semibold tabular-nums"
                  :class="f.state === 'attention' ? 'text-warning' : undefined"
                >
                  <ULink
                    v-if="f.to"
                    :to="f.to"
                    :aria-label="`${labelOf(f.label)}: ${valueOf(f)}`"
                    class="underline-offset-4 hover:underline"
                  >
                    {{ valueOf(f) }}
                  </ULink>
                  <template v-else>
                    {{ valueOf(f) }}
                  </template>
                </dd>
              </div>
            </dl>
          </li>
        </ul>
        <div
          v-else
          class="rounded-lg border border-default p-4"
        >
          <p class="text-muted">
            {{ t('core.live.no-performances') }}
          </p>
          <p
            v-if="next"
            class="mt-1 text-lg"
          >
            {{ t('core.live.next', { title: [next.title, next.label].filter(Boolean).join(', '), when: `${dayBrief(next.startsAt)}, ${time(next.startsAt)}`, venue: next.venue }) }}
          </p>
        </div>
      </section>
      <section
        v-if="tiles.length"
        aria-labelledby="tonight-screens"
        class="flex flex-col gap-3"
      >
        <h2
          id="tonight-screens"
          class="text-sm font-semibold text-muted"
        >
          {{ t('core.live.screens') }}
        </h2>
        <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li
            v-for="tile in tiles"
            :key="tile.id"
          >
            <UButton
              :to="tile.to"
              :icon="tile.icon"
              :label="t(tile.label)"
              color="neutral"
              variant="outline"
              size="xl"
              block
              class="min-h-16 justify-start text-lg"
            >
              <template
                v-if="tile.count"
                #trailing
              >
                <UBadge
                  :label="String(tile.count)"
                  size="lg"
                  class="ms-auto"
                />
              </template>
            </UButton>
          </li>
        </ul>
      </section>
      <EmptyState
        v-else
        icon="i-lucide-moon"
        :title="t('core.live.empty.title')"
        :description="t('core.live.empty.description')"
      />
    </div>
  </PageLive>
</template>
