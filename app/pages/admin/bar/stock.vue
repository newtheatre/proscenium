<!--
Admin: the stock ledger. On hand is always the sum of the movements, so every
figure here is derived and nothing on this page writes a level directly.
-->
<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  title: 'Bar stock',
})

interface StockRow {
  id: string
  name: string
  unit: string
  containerMl: number | null
  stockOnly: boolean
  stockProductId: string | null
  parQty: number | null
  onHandQty: number
  onHandContainers: number
  lastCostPence: number | null
  valuePence: number | null
  belowPar: boolean
}

interface StockResponse {
  rows: StockRow[]
  stockAtCostPence: number
  belowParCount: number
  lastDelivery: { id: string, supplier: string, deliveredOn: string } | null
  openStocktake: { id: string, startedAt: string } | null
}

const toast = useToast()

function statusMessage(error: unknown): string | undefined {
  return (error as { data?: { statusMessage?: string } }).data?.statusMessage
}
const requestFetch = useRequestFetch()
const { data, refresh } = await useAsyncData('admin-bar-stock', () =>
  requestFetch<StockResponse>('/api/admin/bar/stock'))

const rows = computed(() => data.value?.rows ?? [])

// Money is pence in the store and pounds on screen.
const GBP = { style: 'currency' as const, currency: 'GBP' as const }

// Nothing has ever moved, so the first count is the opening stock. Entering it
// as a delivery would put an invented cost into the ledger (#208).
const ledgerEmpty = computed(() => rows.value.length > 0 && rows.value.every(row => row.onHandQty === 0))

const columns = [
  { accessorKey: 'name', header: 'Product' },
  { accessorKey: 'onHandContainers', header: 'On hand' },
  { accessorKey: 'parQty', header: 'Par' },
  { accessorKey: 'lastCostPence', header: 'Last cost' },
  { accessorKey: 'valuePence', header: 'Value' },
  { id: 'actions', header: '' },
]

// Deliveries
const deliveryOpen = ref(false)
const delivery = reactive({ supplier: '', invoiceRef: '', lines: [] as { productId: string, qtyContainers: number | null, costPencePerContainer: number | null }[] })
const saving = ref(false)

function openDelivery() {
  delivery.supplier = ''
  delivery.invoiceRef = ''
  delivery.lines = [{ productId: rows.value[0]?.id ?? '', qtyContainers: null, costPencePerContainer: null }]
  deliveryOpen.value = true
}

const productOptions = computed(() => rows.value.map(r => ({
  label: r.containerMl ? `${r.name} (${r.containerMl} ml)` : r.name,
  value: r.id,
})))

const adjustRow = computed(() => rows.value.find(r => r.id === adjust.productId) ?? null)

async function saveDelivery() {
  saving.value = true
  try {
    const lines = delivery.lines.filter(l => l.productId && l.qtyContainers)
    if (!lines.length) throw new Error('Add at least one line.')
    await $fetch('/api/admin/bar/deliveries', {
      method: 'POST',
      body: {
        supplier: delivery.supplier,
        invoiceRef: delivery.invoiceRef || null,
        lines,
      },
    })
    toast.add({ title: 'Delivery recorded', icon: 'i-lucide-check', color: 'success' })
    deliveryOpen.value = false
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Not recorded', description: statusMessage(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// Adjustments
const adjustOpen = ref(false)
const adjust = reactive({ productId: '', qtyContainers: null as number | null, kind: 'WASTAGE' as 'WASTAGE' | 'TRANSFER' | 'ADJUST', reason: '' })

function openAdjust(row: StockRow) {
  adjust.productId = row.id
  adjust.qtyContainers = null
  adjust.kind = 'WASTAGE'
  adjust.reason = ''
  adjustOpen.value = true
}

async function saveAdjust() {
  saving.value = true
  try {
    // Wastage is a loss however it is typed, so the sign is not the user's to get wrong.
    const magnitude = Math.abs(adjust.qtyContainers ?? 0)
    await $fetch('/api/admin/bar/stock/adjust', {
      method: 'POST',
      body: {
        productId: adjust.productId,
        qtyContainers: adjust.kind === 'WASTAGE' ? -magnitude : adjust.qtyContainers,
        kind: adjust.kind,
        reason: adjust.reason,
      },
    })
    toast.add({ title: 'Recorded', icon: 'i-lucide-check', color: 'success' })
    adjustOpen.value = false
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Not recorded', description: statusMessage(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function startStocktake() {
  try {
    const res = await $fetch<{ id: string }>('/api/admin/bar/stocktakes', { method: 'POST' })
    await navigateTo(`/admin/bar/stocktakes/${res.id}`)
  }
  catch (error) {
    toast.add({ title: 'Could not start a stocktake', description: statusMessage(error), color: 'error' })
  }
}
</script>

<template>
  <UContainer class="py-6 space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap gap-3">
        <UCard>
          <div class="text-xs text-muted uppercase tracking-wide">
            Stock at cost
          </div>
          <div class="text-2xl font-semibold tabular-nums">
            {{ formatMoney(data?.stockAtCostPence ?? 0) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-xs text-muted uppercase tracking-wide">
            Below par
          </div>
          <div class="text-2xl font-semibold tabular-nums">
            {{ data?.belowParCount ?? 0 }}
          </div>
        </UCard>
        <UCard>
          <div class="text-xs text-muted uppercase tracking-wide">
            Last delivery
          </div>
          <div class="text-sm font-medium">
            <template v-if="data?.lastDelivery">
              {{ data.lastDelivery.supplier }}<br>
              <span class="text-muted">{{ formatDate(data.lastDelivery.deliveredOn) }}</span>
            </template>
            <span
              v-else
              class="text-muted"
            >None recorded</span>
          </div>
        </UCard>
      </div>

      <div class="flex gap-2">
        <UButton
          icon="i-lucide-truck"
          @click="openDelivery"
        >
          Record delivery
        </UButton>
        <UButton
          v-if="data?.openStocktake"
          icon="i-lucide-clipboard-list"
          color="warning"
          :to="`/admin/bar/stocktakes/${data.openStocktake.id}`"
        >
          Resume stocktake
        </UButton>
        <UButton
          v-else
          icon="i-lucide-clipboard-list"
          :variant="ledgerEmpty ? 'solid' : 'subtle'"
          @click="startStocktake"
        >
          {{ ledgerEmpty ? 'Count opening stock' : 'Start stocktake' }}
        </UButton>
      </div>
    </div>

    <UAlert
      v-if="!rows.length"
      icon="i-lucide-package-open"
      color="neutral"
      variant="subtle"
      title="Nothing in the catalogue yet"
      description="Add the products you sell first. Stock levels are counted against them."
      :actions="[{ label: 'Go to the catalogue', to: '/admin/bar/catalogue', color: 'neutral', variant: 'outline' }]"
    />

    <UAlert
      v-else-if="ledgerEmpty"
      icon="i-lucide-clipboard-list"
      color="primary"
      variant="subtle"
      title="Count what you already have"
      description="Nothing has moved yet, so the first count is your opening stock. Do not enter it as a delivery: that would put a made-up cost into the ledger, and stock at cost is worked out from it."
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
      <template #onHandContainers-cell="{ row }">
        <span
          class="tabular-nums"
          :class="row.original.belowPar ? 'text-warning font-semibold' : ''"
        >
          {{ formatContainers(row.original, row.original.onHandQty) }}
        </span>
        <span
          v-if="row.original.containerMl"
          class="ml-2 text-xs text-muted tabular-nums"
        >{{ formatQty(row.original, row.original.onHandQty) }}</span>
        <UBadge
          v-if="row.original.belowPar"
          color="warning"
          variant="subtle"
          size="sm"
          class="ml-2"
        >
          Below par
        </UBadge>
      </template>
      <template #parQty-cell="{ row }">
        <span class="tabular-nums text-muted">
          {{ row.original.parQty == null ? '-' : formatContainers(row.original, row.original.parQty) }}
        </span>
      </template>
      <template #lastCostPence-cell="{ row }">
        <span class="tabular-nums">{{ row.original.lastCostPence == null ? '-' : formatMoney(row.original.lastCostPence) }}</span>
      </template>
      <template #valuePence-cell="{ row }">
        <span class="tabular-nums">{{ row.original.valuePence == null ? '-' : formatMoney(row.original.valuePence) }}</span>
      </template>
      <template #actions-cell="{ row }">
        <UButton
          size="xs"
          variant="ghost"
          icon="i-lucide-pencil"
          aria-label="Adjust stock"
          @click="openAdjust(row.original)"
        />
      </template>
    </UTable>

    <UModal
      v-model:open="deliveryOpen"
      title="Record a delivery"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="Supplier"
            required
          >
            <UInput
              v-model="delivery.supplier"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Invoice reference">
            <UInput
              v-model="delivery.invoiceRef"
              class="w-full"
            />
          </UFormField>

          <div class="space-y-2">
            <div
              v-for="(line, i) in delivery.lines"
              :key="i"
              class="flex gap-2 items-end"
            >
              <UFormField
                label="Product"
                class="flex-1"
              >
                <USelectMenu
                  v-model="line.productId"
                  :items="productOptions"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Containers"
                class="w-24"
              >
                <UInput
                  v-model.number="line.qtyContainers"
                  type="number"
                  min="0"
                  step="1"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Cost each"
                class="w-40"
              >
                <UInputNumber
                  :model-value="line.costPencePerContainer === null ? undefined : line.costPencePerContainer / 100"
                  :min="0"
                  :step="0.1"
                  :format-options="GBP"
                  class="w-full"
                  @update:model-value="value => line.costPencePerContainer = value == null ? null : Math.round(value * 100)"
                />
              </UFormField>
              <UButton
                icon="i-lucide-x"
                variant="ghost"
                color="neutral"
                aria-label="Remove line"
                @click="delivery.lines.splice(i, 1)"
              />
            </div>
            <UButton
              size="xs"
              variant="subtle"
              icon="i-lucide-plus"
              @click="delivery.lines.push({ productId: '', qtyContainers: null, costPencePerContainer: null })"
            >
              Add line
            </UButton>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            variant="ghost"
            color="neutral"
            @click="deliveryOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            :loading="saving"
            @click="saveDelivery"
          >
            Record
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="adjustOpen"
      title="Adjust stock"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="What happened"
            required
          >
            <USelectMenu
              v-model="adjust.kind"
              :items="[
                { label: 'Wastage (spillage, breakage, out of date)', value: 'WASTAGE' },
                { label: 'Transfer in or out', value: 'TRANSFER' },
                { label: 'Correction', value: 'ADJUST' },
              ]"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="adjustRow ? `Containers (${unitLabel(adjustRow.unit)})` : 'Containers'"
            required
            :help="adjust.kind === 'WASTAGE' ? 'Recorded as a loss. Half a bottle is 0.5.' : 'Negative to take stock out. Half a bottle is 0.5.'"
          >
            <UInput
              v-model.number="adjust.qtyContainers"
              type="number"
              step="0.01"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Reason"
            required
            help="This is the audit trail. Say what happened."
          >
            <UInput
              v-model="adjust.reason"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            variant="ghost"
            color="neutral"
            @click="adjustOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            :loading="saving"
            :disabled="!adjust.reason || !adjust.qtyContainers"
            @click="saveAdjust"
          >
            Record
          </UButton>
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
