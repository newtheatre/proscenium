<script setup lang="ts">
import type { Stocktake, StocktakeLine } from '#shared/utils/stocktakes'

// Tonight's bar shift counts into the open stocktake from here (decision 0099); opening and
// applying it stay on the console with bar.stocktake.
definePageMeta({ layout: 'tonight', docs: '/docs/bar/stocktakes' })
useSeoMeta({ title: 'Stocktake' })

interface OpenStocktake { stocktake: Stocktake | null, lines: StocktakeLine[] }

const request = useRequestFetch()

const { data, error } = await useAsyncData(
  'tonight-stocktake',
  () => request<OpenStocktake>('/api/admin/bar/stocktakes/open'),
  { default: () => ({ stocktake: null, lines: [] }) as OpenStocktake },
)

setNightSubject(() => ({ title: 'Stocktake', meta: data.value.stocktake ? `Opened ${saysWhen(data.value.stocktake.openedAt)}` : null }))

// Somebody not on tonight's bar is refused the screen in place of the work (issue 1304).
const refusal = computed(() => (error.value && refusalStatus(error.value) === 403 ? refusalText(error.value) : null))

// Each line saves on its own, and the register's answer replaces that one line only (issue 1321).
function saved(line: StocktakeLine): void {
  data.value = { ...data.value, lines: data.value.lines.map(one => (one.itemId === line.itemId ? line : one)) }
}
</script>

<template>
  <NightScreen
    title="Stocktake"
    :refused="refusal"
  >
    <UAlert
      v-if="error"
      data-test="stocktake-refusal"
      color="error"
      variant="subtle"
      :description="refusalText(error)"
    />

    <p
      v-else-if="!data.stocktake"
      class="text-sm text-muted"
      data-test="no-stocktake"
    >
      No stocktake is open. The Bar Manager or the Front of House Manager opens one from the
      console, and it appears here for tonight's bar shift to count into.
    </p>

    <div
      v-else
      class="space-y-4"
    >
      <p class="text-sm text-muted">
        Each count saves when you leave its field or press Enter, with your name on it. The Bar
        Manager or the Front of House Manager checks every line before applying the count.
      </p>

      <StocktakeCounts
        :stocktake-id="data.stocktake.id"
        :lines="data.lines"
        :open="true"
        @saved="saved"
      />
    </div>
  </NightScreen>
</template>
