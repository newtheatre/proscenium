<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { saysMoney, saysQuantity } from '#shared/utils/bar'
import type { Stocktake, StocktakeLine } from '#shared/utils/stocktakes'
import type { TableColumn } from '@nuxt/ui'

const UBadge = resolveComponent('UBadge')
const UInputNumber = resolveComponent('UInputNumber')

definePageMeta({ layout: 'console', title: 'Stocktake', middleware: 'console', docs: '/docs/bar/stocktakes' })

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

// A draft differs from what the server last held: Apply must save these before posting, or the
// confirmation and the movements it posts would both be reading stale counts (F-115 criterion 3).
const dirty = computed(() =>
  data.value?.lines.some(line => (drafts.value[line.itemId] ?? null) !== line.countedQty) ?? false)

async function openApply(): Promise<void> {
  if (dirty.value) {
    await saveCounts()
    if (failure.value) return
  }
  confirming.value = true
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

const listingFailure = useListFailure(error, 'This stocktake could not be read.')

function variance(line: StocktakeLine): number | null {
  const typed = drafts.value[line.itemId]
  return typed === undefined ? null : typed - line.expectedQty
}

const uncounted = computed(() => data.value?.lines.filter(line => drafts.value[line.itemId] === undefined).length ?? 0)

// Read after openApply's save, so these name what is about to post, not what was last typed.
const applyCounted = computed(() => data.value?.lines.filter(line => line.countedQty !== null).length ?? 0)
const applyUncounted = computed(() => data.value?.lines.filter(line => line.countedQty === null).length ?? 0)
const applyNetVarianceCostPence = computed(() =>
  data.value?.lines.reduce((total, line) => total + (line.varianceCostPence ?? 0), 0) ?? 0)

// A real count is a real number of millilitres or units, not a stepper twitch: the whole cell is
// the field, and only what was actually typed distinguishes counted from blank (F-115 criterion 2).
const uncountedOnly = ref(false)

const visibleLines = computed(() => {
  if (!data.value) return []
  return uncountedOnly.value
    ? data.value.lines.filter(line => drafts.value[line.itemId] === undefined)
    : data.value.lines
})

function focusNext(itemId: string): void {
  // Walks the stable, unfiltered order rather than visibleLines: by the time this runs, typing
  // has already dropped the just-counted row out of an active "Only uncounted" filter.
  if (!data.value) return
  const all = data.value.lines
  const start = all.findIndex(line => line.itemId === itemId) + 1
  const next = all.slice(start).find(line => !uncountedOnly.value || drafts.value[line.itemId] === undefined)
  if (!next) return
  document.querySelector<HTMLInputElement>(`[data-test="counted-${next.itemId}"]`)?.focus()
}

const columns: TableColumn<StocktakeLine>[] = [
  {
    id: 'item',
    header: 'Stocked item',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.itemName),
      // Below sm the expected figure and its cost are hidden: shown here instead, so a phone
      // keeps the count field in view without losing what they said (issue 922).
      h('div', { class: 'sm:hidden text-xs text-muted' }, `${saysQuantity(row.original.expectedQty, row.original.unit)} expected`),
    ]),
  },
  {
    id: 'expected',
    header: 'Expected',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} text-right whitespace-nowrap font-mono` } },
    cell: ({ row }) => saysQuantity(row.original.expectedQty, row.original.unit),
  },
  {
    id: 'counted',
    header: 'Counted',
    cell: ({ row }) => {
      const line = row.original
      if (!open.value) {
        return line.countedQty === null ? 'Uncounted' : saysQuantity(line.countedQty, line.unit)
      }
      return h('div', { class: 'flex items-center gap-2' }, [
        h(UInputNumber, {
          'modelValue': drafts.value[line.itemId],
          'onUpdate:modelValue': (value: number | undefined) => {
            drafts.value[line.itemId] = value
          },
          'min': 0,
          'increment': false,
          'decrement': false,
          'placeholder': 'Uncounted',
          'inputmode': 'numeric',
          'class': 'w-full',
          'aria-label': `Counted, ${line.itemName}`,
          'data-test': `counted-${line.itemId}`,
          'onKeydown': (event: KeyboardEvent) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            focusNext(line.itemId)
          },
        }),
        drafts.value[line.itemId] === undefined
          ? h(UBadge, {
              'color': 'neutral',
              'variant': 'subtle',
              'size': 'sm',
              'data-test': `uncounted-badge-${line.itemId}`,
            }, () => 'Uncounted')
          : null,
      ])
    },
  },
  {
    id: 'variance',
    header: 'Variance',
    meta: RIGHT_ALIGNED,
    cell: ({ row }) => {
      const line = row.original
      const text = open.value
        ? (variance(line) === null ? '' : saysQuantity(variance(line)!, line.unit))
        : (line.variance === null ? '' : saysQuantity(line.variance, line.unit))
      return h('span', { 'data-test': `variance-${line.itemId}` }, text)
    },
  },
  {
    id: 'atCost',
    header: 'At cost',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} text-right whitespace-nowrap font-mono` } },
    cell: ({ row }) => (row.original.varianceCostPence === null ? '' : saysMoney(row.original.varianceCostPence)),
  },
]
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="listingFailure"
      data-test="listing-failure"
      color="error"
      variant="subtle"
      :description="listingFailure.message"
      :actions="listingFailure.enrolPath ? [{ label: 'Set up an authenticator app', to: listingFailure.enrolPath, color: 'error' }] : []"
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
            Opened {{ saysWhen(data.stocktake.openedAt) }}<template v-if="data.stocktake.appliedAt">
              , applied {{ saysWhen(data.stocktake.appliedAt) }}
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
            :loading="saving"
            @click="openApply"
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

      <USwitch
        v-if="open"
        v-model="uncountedOnly"
        data-test="uncounted-only-filter"
        label="Only uncounted"
      />

      <UTable
        :data="visibleLines"
        :columns="columns"
        data-test="stocktake-lines"
      >
        <template #empty>
          <p class="py-6 text-center text-sm text-muted">
            <!-- "Nothing to count" would read as an empty stocktake when the filter, not the
            stocktake, is why the table is empty (F-115 criterion 2). -->
            {{ uncountedOnly ? 'Everything is counted.' : 'Nothing to count.' }}
          </p>
        </template>
      </UTable>
    </template>
    <div
      v-else-if="status === 'pending'"
      data-test="stocktake-skeleton"
      class="space-y-6"
    >
      <div class="space-y-2">
        <USkeleton class="h-5 w-20" />
        <USkeleton class="h-4 w-72" />
      </div>
      <USkeleton class="h-64 w-full" />
    </div>

    <UModal
      :open="confirming"
      title="Apply this stocktake"
      description="Posts one adjustment movement per item that counted differently, then freezes the stocktake for good."
      @update:open="confirming = false"
    >
      <template #body>
        <dl
          class="space-y-1 text-sm"
          data-test="apply-summary"
        >
          <div class="flex justify-between">
            <dt class="text-muted">
              Counted
            </dt>
            <dd data-test="apply-counted">
              {{ plural(applyCounted, 'item') }}
            </dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-muted">
              Not counted
            </dt>
            <dd data-test="apply-uncounted">
              {{ plural(applyUncounted, 'item') }}
            </dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-muted">
              Net variance at cost
            </dt>
            <dd data-test="apply-net-variance">
              {{ saysMoney(applyNetVarianceCostPence) }}
            </dd>
          </div>
        </dl>
      </template>

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
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
