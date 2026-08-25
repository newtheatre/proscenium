<!--
Admin: counting a stocktake. Variance is applied against on-hand at the moment
you finish, not the snapshot, so trading during the count is not erased.
-->
<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  title: 'Stocktake',
})

interface Line {
  id: string
  productId: string
  name: string
  unit: string
  containerMl: number | null
  expectedQty: number
  countedQty: number | null
  varianceQty: number | null
  reason: string | null
}

interface Stocktake {
  id: string
  status: 'OPEN' | 'APPLIED' | 'ABANDONED'
  notes: string | null
  startedAt: string
  finishedAt: string | null
  lines: Line[]
  countedLines: number
}

const route = useRoute()
const toast = useToast()
const requestFetch = useRequestFetch()
const { data, refresh } = await useAsyncData(`stocktake-${route.params.id}`, () =>
  requestFetch<Stocktake>(`/api/admin/bar/stocktakes/${route.params.id}`))

function statusMessage(error: unknown): string | undefined {
  return (error as { data?: { statusMessage?: string } }).data?.statusMessage
}

// `''` is a real state, not an impossible one: a number input emits it for an
// emptied or unparseable box, and it must clear the count, never save as zero.
const counts = reactive<Record<string, number | '' | undefined>>({})
// Why a line varies, kept beside the count so one save carries both.
const reasons = reactive<Record<string, string>>({})
watchEffect(() => {
  for (const line of data.value?.lines ?? []) {
    if (!(line.id in counts)) counts[line.id] = line.countedQty == null ? undefined : qtyToContainers(line, line.countedQty)
    if (!(line.id in reasons)) reasons[line.id] = line.reason ?? ''
  }
})

const rows = computed(() => data.value?.lines ?? [])
const isOpen = computed(() => data.value?.status === 'OPEN')
/** Every line expected nothing, so this count establishes the ledger (#208). */
const isOpening = computed(() => rows.value.length > 0 && rows.value.every(line => line.expectedQty === 0))
const saving = ref(false)

const columns = [
  { accessorKey: 'name', header: 'Product' },
  { accessorKey: 'expectedQty', header: 'Expected' },
  { id: 'counted', header: 'Counted' },
  { id: 'variance', header: 'Variance' },
  { id: 'reason', header: 'Reason' },
]

function variance(line: Line): number | null {
  const counted = counts[line.id]
  if (counted == null || counted === '') return null
  return containersToQty(line, counted) - line.expectedQty
}

/** Saved in batches, so a long count is not one request per keystroke. */
async function saveCounts() {
  saving.value = true
  try {
    const lines = rows.value
      .filter(l => counts[l.id] !== undefined || (reasons[l.id] ?? '') !== (l.reason ?? ''))
      .map((l) => {
        const counted = counts[l.id]
        return {
          lineId: l.id,
          countedContainers: counted == null || counted === '' ? null : counted,
          reason: (reasons[l.id] ?? '').trim() || null,
        }
      })
    for (let i = 0; i < lines.length; i += 50) {
      await $fetch(`/api/admin/bar/stocktakes/${route.params.id}/lines`, {
        method: 'PATCH',
        body: { lines: lines.slice(i, i + 50) },
      })
    }
    toast.add({ title: 'Counts saved', icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Not saved', description: statusMessage(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function finish() {
  if (saving.value) return
  saving.value = true
  try {
    await saveCounts()
    // saveCounts clears the flag in its own finally, which would re-enable the
    // button while this POST is still in flight.
    saving.value = true
    const res = await $fetch<{ applied: number }>(`/api/admin/bar/stocktakes/${route.params.id}/finish`, { method: 'POST' })
    toast.add({ title: `Applied ${res.applied} adjustment${res.applied === 1 ? '' : 's'}`, icon: 'i-lucide-check', color: 'success' })
    await navigateTo('/admin/bar/stock')
  }
  catch (error) {
    toast.add({ title: 'Not applied', description: statusMessage(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function abandon() {
  saving.value = true
  try {
    await $fetch(`/api/admin/bar/stocktakes/${route.params.id}/abandon`, { method: 'POST' })
    toast.add({ title: 'Stocktake abandoned. Nothing was changed.', icon: 'i-lucide-check' })
    await navigateTo('/admin/bar/stock')
  }
  catch (error) {
    toast.add({ title: 'Not abandoned', description: statusMessage(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UContainer class="py-6 space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">
          {{ isOpening ? 'Opening stock' : 'Stocktake' }}
        </h2>
        <p class="text-sm text-muted">
          Started {{ formatDateTime(data?.startedAt) }} ·
          {{ data?.countedLines ?? 0 }} of {{ rows.length }} counted
        </p>
      </div>
      <div
        v-if="isOpen"
        class="flex gap-2"
      >
        <UButton
          variant="ghost"
          color="neutral"
          :loading="saving"
          @click="abandon"
        >
          Abandon
        </UButton>
        <UButton
          variant="subtle"
          :loading="saving"
          @click="saveCounts"
        >
          Save counts
        </UButton>
        <UButton
          :loading="saving"
          @click="finish"
        >
          Finish and apply
        </UButton>
      </div>
      <UBadge
        v-else
        :color="data?.status === 'APPLIED' ? 'success' : 'neutral'"
        variant="subtle"
      >
        {{ data?.status === 'APPLIED' ? 'Applied' : 'Abandoned' }}
      </UBadge>
    </div>

    <UAlert
      v-if="isOpen"
      icon="i-lucide-info"
      color="neutral"
      variant="subtle"
      :title="isOpening ? 'Count everything you have' : 'Count in containers'"
      :description="isOpening
        ? 'This is the opening count, so what you enter becomes the level. A part bottle is a decimal: half a bottle is 0.5. Leave a line blank and it stays at zero.'
        : 'A part bottle is a decimal: half a bottle is 0.5. Leave a line blank and it is not adjusted.'"
    />

    <UTable
      :data="rows"
      :columns="columns"
    >
      <template #name-cell="{ row }">
        <div class="font-medium">
          {{ row.original.name }}
        </div>
        <div class="text-xs text-muted">
          per {{ row.original.unit }}
        </div>
      </template>
      <template #expectedQty-cell="{ row }">
        <span class="tabular-nums text-muted">{{ formatContainers(row.original, row.original.expectedQty) }}</span>
      </template>
      <template #counted-cell="{ row }">
        <UInput
          v-if="isOpen"
          v-model.number="counts[row.original.id]"
          type="number"
          step="0.01"
          min="0"
          class="w-28"
          :aria-label="`Counted ${row.original.name}`"
        />
        <span
          v-else
          class="tabular-nums"
        >
          {{ row.original.countedQty == null ? '-' : formatContainers(row.original, row.original.countedQty) }}
        </span>
      </template>
      <template #variance-cell="{ row }">
        <span
          v-if="variance(row.original) !== null"
          class="tabular-nums font-medium"
          :class="variance(row.original)! < 0 ? 'text-error' : variance(row.original)! > 0 ? 'text-success' : 'text-muted'"
        >
          {{ variance(row.original)! > 0 ? '+' : '' }}{{ formatContainers(row.original, variance(row.original)!) }}
        </span>
        <span
          v-else
          class="text-muted"
        >-</span>
      </template>
      <template #reason-cell="{ row }">
        <UInput
          v-if="isOpen"
          v-model="reasons[row.original.id]"
          class="w-56"
          placeholder="Breakage, pour variance, miscounted"
          :aria-label="`Reason for ${row.original.name}`"
        />
        <span
          v-else
          class="text-sm"
        >{{ row.original.reason || '-' }}</span>
      </template>
    </UTable>
  </UContainer>
</template>
