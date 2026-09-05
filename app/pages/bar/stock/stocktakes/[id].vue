<script setup lang="ts">
import { saysMoney, saysQuantity } from '#shared/utils/bar'
import type { Stocktake, StocktakeLine } from '#shared/utils/stocktakes'

definePageMeta({ layout: 'console', title: 'Stocktake', middleware: 'console' })

const route = useRoute()
const id = route.params.id as string

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const saving = ref(false)
const applying = ref(false)
const confirming = ref(false)

const { data, status, error, refresh } = await useAsyncData(
  `bar-stocktake-${id}`,
  () => request<{ stocktake: Stocktake, lines: StocktakeLine[] }>(`/api/admin/bar/stocktakes/${id}`),
)

// Blank stays blank until typed into: a cleared field is a count of nothing, not zero.
const drafts = ref<Record<string, number | undefined>>({})

watch(data, (held) => {
  if (!held) return
  drafts.value = Object.fromEntries(held.lines.map(line => [line.itemId, line.countedQty ?? undefined]))
}, { immediate: true })

const open = computed(() => data.value?.stocktake.status === 'OPEN')

const when = (at: number): string =>
  formatLondon(new Date(at * 1000), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

async function saveCounts(): Promise<void> {
  if (!data.value) return

  // Only what actually changed: a large catalogue would otherwise resubmit every line every
  // time, which is both wasted work and, past the form's own cap, a save that can never succeed.
  const counts = data.value.lines
    .filter(line => (drafts.value[line.itemId] ?? null) !== line.countedQty)
    .map(line => ({ itemId: line.itemId, counted: drafts.value[line.itemId] ?? null }))

  if (counts.length === 0) {
    toast.add({ title: 'Nothing to save', icon: 'i-lucide-info', color: 'neutral' })
    return
  }

  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/bar/stocktakes/${id}/counts`, { method: 'PUT', body: { counts } })
    toast.add({ title: 'Counts saved', icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

async function apply(): Promise<void> {
  applying.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/bar/stocktakes/${id}/apply`, { method: 'POST' })
    toast.add({
      title: 'Stocktake applied',
      description: 'One adjustment movement was posted for every item that counted differently.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    confirming.value = false
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
    confirming.value = false
  }
  finally {
    applying.value = false
  }
}

const listingFailure = computed(() => (error.value ? refusalText(error.value, 'This stocktake could not be read.') : null))

function variance(line: StocktakeLine): number | null {
  const typed = drafts.value[line.itemId]
  return typed === undefined ? null : typed - line.expectedQty
}

const uncounted = computed(() => data.value?.lines.filter(line => drafts.value[line.itemId] === undefined).length ?? 0)
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="listingFailure"
      data-test="listing-failure"
      color="error"
      variant="subtle"
      :description="listingFailure"
    />
    <UAlert
      v-if="failure"
      data-test="stocktake-failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <template v-if="data">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <UBadge
            :color="open ? 'warning' : 'neutral'"
            variant="subtle"
          >
            {{ open ? 'Open' : 'Applied' }}
          </UBadge>
          <p class="mt-1 text-sm text-muted">
            Opened {{ when(data.stocktake.openedAt) }}<template v-if="data.stocktake.appliedAt">
              , applied {{ when(data.stocktake.appliedAt) }}
            </template>.
            <span data-test="uncounted-count">{{ plural(uncounted, 'item') }} not yet counted.</span>
          </p>
        </div>
        <div
          v-if="open"
          class="flex gap-2"
        >
          <UButton
            data-test="save-counts"
            color="neutral"
            variant="subtle"
            :loading="saving"
            @click="saveCounts"
          >
            Save counts
          </UButton>
          <UButton
            data-test="open-apply"
            @click="confirming = true"
          >
            Apply
          </UButton>
        </div>
      </div>

      <UAlert
        v-if="!open"
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        title="This stocktake is frozen"
        description="A mistake is corrected by a new stocktake or a reversing movement, never an edit here."
      />

      <table
        class="w-full text-sm"
        data-test="stocktake-lines"
      >
        <thead>
          <tr class="border-b text-left text-muted">
            <th class="py-2">
              Stocked item
            </th>
            <th class="py-2">
              Expected
            </th>
            <th class="py-2">
              Counted
            </th>
            <th class="py-2">
              Variance
            </th>
            <th class="py-2">
              At cost
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="line in data.lines"
            :key="line.id"
            class="border-b last:border-0"
          >
            <td class="py-2">
              {{ line.itemName }}
            </td>
            <td class="py-2">
              {{ saysQuantity(line.expectedQty, line.unit) }}
            </td>
            <td class="py-2">
              <UInputNumber
                v-if="open"
                v-model="drafts[line.itemId]"
                :min="0"
                size="sm"
                class="w-24"
                :data-test="`counted-${line.itemId}`"
              />
              <span v-else>
                {{ line.countedQty === null ? 'Uncounted' : saysQuantity(line.countedQty, line.unit) }}
              </span>
            </td>
            <td
              class="py-2"
              :data-test="`variance-${line.itemId}`"
            >
              <template v-if="open">
                {{ variance(line) === null ? '' : saysQuantity(variance(line)!, line.unit) }}
              </template>
              <template v-else>
                {{ line.variance === null ? '' : saysQuantity(line.variance, line.unit) }}
              </template>
            </td>
            <td class="py-2">
              {{ line.varianceCostPence === null ? '' : saysMoney(line.varianceCostPence) }}
            </td>
          </tr>
        </tbody>
      </table>
    </template>
    <p
      v-else-if="status === 'pending'"
      class="text-sm text-muted"
    >
      Loading…
    </p>

    <UModal
      :open="confirming"
      title="Apply this stocktake?"
      description="Posts one adjustment movement per item that counted differently, then freezes the stocktake for good."
      @update:open="confirming = false"
    >
      <template #footer>
        <UButton
          data-test="confirm-apply"
          :loading="applying"
          @click="apply"
        >
          Apply
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="confirming = false"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </div>
</template>
