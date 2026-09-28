<script setup lang="ts">
import type { Stocktake, StocktakeLine } from '#shared/utils/stocktakes'

// Tonight's bar shift counts into the open stocktake from here (decision 0099); opening and
// applying it stay on the console with bar.stocktake.
definePageMeta({ layout: 'tonight', docs: '/docs/bar/stocktakes' })
useSeoMeta({ title: 'Stocktake' })

interface OpenStocktake { stocktake: Stocktake | null, lines: StocktakeLine[] }

const request = useRequestFetch()

const open = ref<OpenStocktake>({ stocktake: null, lines: [] })
const failure = ref<string | null>(null)
const refusal = ref<string | null>(null)

function apply(answered: SettledRead<OpenStocktake>): void {
  if (answered.kind === 'FAILED') {
    failure.value = answered.failure
    // Somebody not on tonight's bar is refused the screen in place of the work (issue 1304).
    refusal.value = refusalOf(answered)
    return
  }
  open.value = answered.value
  failure.value = null
  refusal.value = null
}

// In the served page, so the count, the line saying none is open or the refusal is what a phone
// paints first, and a tap from the hub never waits on the network (issue 1521).
const waiting = useServedRead('tonight-stocktake', () => settleRead(() => request<OpenStocktake>('/api/admin/bar/stocktakes/open')), apply)

setNightSubject(() => ({ title: 'Stocktake', meta: open.value.stocktake ? `Opened ${saysWhen(open.value.stocktake.openedAt)}` : null }))

// Each line saves on its own, and the register's answer replaces that one line only (issue 1321).
function saved(line: StocktakeLine): void {
  open.value = { ...open.value, lines: open.value.lines.map(one => (one.itemId === line.itemId ? line : one)) }
}
</script>

<template>
  <NightScreen
    title="Stocktake"
    :refused="refusal"
    :busy="waiting"
  >
    <UAlert
      v-if="failure"
      data-test="stocktake-refusal"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <div
      v-else-if="open.stocktake"
      class="space-y-4"
    >
      <p class="text-sm text-muted">
        Each count saves when you leave its field or press Enter, with your name on it. The Bar
        Manager or the Front of House Manager checks every line before applying the count.
      </p>

      <StocktakeCounts
        :stocktake-id="open.stocktake.id"
        :lines="open.lines"
        :open="true"
        @saved="saved"
      />
    </div>

    <p
      v-else-if="!waiting"
      class="text-sm text-muted"
      data-test="no-stocktake"
    >
      No stocktake is open. The Bar Manager or the Front of House Manager opens one from the
      console, and it appears here for tonight's bar shift to count into.
    </p>
  </NightScreen>
</template>
