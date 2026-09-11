<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import { saysHouse, saysOnSale, saysOnSaleCount, saysUnpaid, soldShare } from '#shared/utils/show-strip'
import type { AdminShow } from '#shared/utils/programme'

// The show's state at a glance (D-132 criterion 2). Every figure is counted by the endpoint, so
// nothing here can state a number the rows disagree with.

const props = defineProps<{ show: AdminShow }>()

const onSale = computed(() => saysOnSale(props.show.onSaleCount, props.show.performanceCount))
const share = computed(() => soldShare(props.show.soldTickets, props.show.capacity))

const nextPerformance = computed(() => {
  const at = props.show.nextPerformanceAt
  if (at === null) return null
  return formatLondon(new Date(at * 1000), { dateStyle: 'medium', timeStyle: 'short' })
})
</script>

<template>
  <div
    class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
    data-test="show-strip"
  >
    <UCard>
      <p class="text-sm text-muted">
        On sale
      </p>
      <UBadge
        :color="show.onSaleCount > 0 ? 'success' : 'neutral'"
        variant="subtle"
        class="mt-2"
        data-test="strip-on-sale"
      >
        {{ onSale }}
      </UBadge>
      <p class="mt-2 text-sm text-muted">
        {{ saysOnSaleCount(show.onSaleCount, show.performanceCount) }}
      </p>
    </UCard>

    <UCard>
      <p class="text-sm text-muted">
        Next performance
      </p>
      <p
        class="mt-2 font-semibold"
        data-test="strip-next"
      >
        {{ nextPerformance ?? 'None scheduled' }}
      </p>
      <p class="mt-2 text-sm text-muted">
        {{ show.nextPerformanceVenue ?? 'Add one and it waits off sale' }}
      </p>
    </UCard>

    <UCard>
      <p class="text-sm text-muted">
        Sold
      </p>
      <p
        class="mt-2 font-semibold"
        data-test="strip-sold"
      >
        {{ saysHouse(show.soldTickets, show.capacity) }}
      </p>
      <UProgress
        v-if="share !== null"
        :model-value="share"
        size="sm"
        class="mt-3"
        :get-value-label="() => saysHouse(show.soldTickets, show.capacity)"
      />
      <p
        v-else
        class="mt-2 text-sm text-muted"
      >
        Nothing to measure against yet
      </p>
    </UCard>

    <UCard>
      <p class="text-sm text-muted">
        Unpaid
      </p>
      <p
        class="mt-2 font-semibold"
        data-test="strip-unpaid"
      >
        {{ plural(show.unpaidTickets, 'ticket') }}
      </p>
      <p class="mt-2 text-sm text-muted">
        {{ saysUnpaid(show.unpaidTickets) }}
      </p>
    </UCard>
  </div>
</template>
