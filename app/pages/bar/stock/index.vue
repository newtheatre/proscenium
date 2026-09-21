<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import {
  HAND_ENTERED_KINDS,
  REASONS_BY_KIND,
  STOCK_UNITS,
  movementEntryForm,
  says,
  saysQuantity,
  saysStockStatus,
  stockItemForm,
  stockStatus,
} from '#shared/utils/bar'
import { barItemsList } from '#shared/utils/bar-items-list'
import type { MovementReason, StockItem, StockMovementKind, StockUnit } from '#shared/utils/bar'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Stock', middleware: 'console', docs: '/docs/bar/stock' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const saving = ref(false)

interface Listing { items: StockItem[], total: number, pageSize: number, pages: number }

const empty = (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 })

// Search, filters, sort and page live in the URL (K-129).
const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(barItemsList)

const { data, status, error, refresh } = await useAsyncData(
  'bar-items',
  () => request<Listing>('/api/admin/bar/items', { query: query.value }),
  { watch: [query], default: empty },
)

const editing = ref<StockItem | null>(null)
const open = ref(false)
const moving = ref<StockItem | null>(null)
const removing = ref<StockItem | null>(null)

watch([open, moving], () => {
  failure.value = null
})

interface ItemState {
  name: string
  unit: StockUnit
  containerMl?: number
  parQty?: number
  category?: string
  ageRestricted: boolean
  allergenNotes?: string
}

const state = reactive<ItemState>({ name: '', unit: 'ML', ageRestricted: true })

type HandEnteredKind = Exclude<StockMovementKind, 'SALE' | 'COMP' | 'STOCKTAKE' | 'TRANSFER' | 'REVERSAL'>

interface MovementState {
  kind: HandEnteredKind
  qty: number
  reason?: MovementReason
  unitCostPence?: number
  // An adjustment goes either way: stock is found as often as it is lost.
  adds: boolean
}

const movement = reactive<MovementState>({ kind: 'DELIVERY', qty: 1, adds: true })

const unitOptions = STOCK_UNITS.map(value => ({ label: says(value), value }))
// A reversal is raised from the movement history, against the movement it cancels.
const kindOptions = (HAND_ENTERED_KINDS.filter(kind => kind !== 'REVERSAL') as HandEnteredKind[])
  .map(value => ({ label: says(value), value }))
// Only the reasons the kind actually takes: the server refuses the rest, so the picker never
// offers one it would (F-204, 3.5).
const reasonOptions = computed(() => (REASONS_BY_KIND[movement.kind] ?? []).map(value => ({ label: says(value), value })))

watch(() => movement.kind, () => {
  movement.reason = undefined
})
const directionOptions = [{ label: 'Add to stock', value: true }, { label: 'Take off stock', value: false }]

// The field takes pounds and the request carries pence, converted here and nowhere else (0004).
// Undefined stays undefined: a delivery whose cost nobody entered records none rather than nought.
const pounds = computed({
  get: () => (movement.unitCostPence === undefined ? undefined : movement.unitCostPence / 100),
  set: (value: number | undefined) => {
    movement.unitCostPence = value === undefined ? undefined : Math.round(value * 100)
  },
})

// A ticket price is per bottle or keg, not per millilitre nobody has ever priced by hand
// (F-114 criterion 6): asked in the unit the manager actually holds, the container.
const byContainer = computed(() => moving.value?.unit === 'ML' && Boolean(moving.value?.containerMl))

// Converted once, at the pounds-per-container to pence-per-ml boundary, the same rule as
// `pounds` above: never redisplayed and redivided as the figure is edited.
const containerPounds = ref<number | undefined>(undefined)

// A whole penny a ml is the ledger's own limit (unit_cost_pence is an integer, 0004): the same
// figure a manager dividing by hand would have had to settle for typing directly.
watch(containerPounds, (value) => {
  const size = moving.value?.containerMl
  movement.unitCostPence = value === undefined || !size ? undefined : Math.round((value * 100) / size)
})

async function reload(): Promise<void> {
  await refresh()
  if (page.value > data.value.pages) page.value = data.value.pages
}

function edit(item: StockItem | null): void {
  editing.value = item
  Object.assign(state, {
    name: item?.name ?? '',
    unit: item?.unit ?? 'ML',
    containerMl: item?.containerMl ?? undefined,
    parQty: item?.parQty ?? undefined,
    category: item?.category ?? undefined,
    ageRestricted: item?.ageRestricted ?? true,
    allergenNotes: item?.allergenNotes ?? undefined,
  })
  open.value = true
}

function moveStock(item: StockItem): void {
  moving.value = item
  Object.assign(movement, { kind: 'DELIVERY', qty: 1, reason: undefined, unitCostPence: undefined, adds: true })
  containerPounds.value = undefined
}

async function save(): Promise<void> {
  saving.value = true
  failure.value = null
  const body = {
    name: state.name.trim(),
    unit: state.unit,
    containerMl: state.unit === 'ML' ? state.containerMl ?? null : null,
    parQty: state.parQty ?? null,
    category: state.category?.trim() || null,
    ageRestricted: state.ageRestricted,
    allergenNotes: state.allergenNotes?.trim() || null,
  }
  try {
    if (editing.value) await $fetch(`/api/admin/bar/items/${editing.value.id}`, { method: 'PUT', body })
    else await $fetch('/api/admin/bar/items', { method: 'POST', body })

    toast.add({
      title: editing.value ? 'Stocked item changed' : 'Stocked item added',
      icon: 'i-lucide-check',
      color: 'success',
    })
    open.value = false
    await reload()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

// The screen states the sign rather than leaving somebody to type a minus. A delivery only adds,
// wastage only takes away, and an adjustment is whichever the manager chose.
const adding = computed(() => movement.kind === 'DELIVERY' || (movement.kind === 'ADJUST' && movement.adds))
const signedQty = computed(() => (adding.value ? Math.abs(movement.qty) : -Math.abs(movement.qty)))

async function record(): Promise<void> {
  const item = moving.value
  if (!item) return

  saving.value = true
  failure.value = null
  try {
    await $fetch('/api/admin/bar/movements', {
      method: 'POST',
      body: {
        itemId: item.id,
        kind: movement.kind,
        qty: signedQty.value,
        reason: movement.reason ?? null,
        unitCostPence: movement.kind === 'DELIVERY' ? movement.unitCostPence ?? null : null,
      },
    })
    toast.add({
      title: `${says(movement.kind)} recorded`,
      description: 'On-hand is the sum of the movements, so it has moved with it.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    moving.value = null
    await reload()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

// The refusal names the products that still pour it, and offers to retire the item and take them
// off the till in one batch (F-128 criteria 5 and 6).
const hiding = ref<{ item: StockItem, products: { id: string, name: string }[] } | null>(null)

// Retiring confirms; putting an item back in stock does not (K-123 criterion 7). A refusal that
// names the products still pouring it hands over to the batch confirmation above.
const retiring = ref<StockItem | null>(null)
const retireFailure = ref<string | null>(null)
const retireWorking = ref(false)

async function retire(): Promise<void> {
  const item = retiring.value
  if (!item) return
  retireWorking.value = true
  retireFailure.value = null
  try {
    await $fetch(`/api/admin/bar/items/${item.id}/status`, { method: 'POST', body: { status: 'RETIRED', hideDependents: false } })
    toast.add({ title: `${item.name} is retired`, icon: 'i-lucide-check', color: 'success' })
    retiring.value = null
    await reload()
  }
  catch (refused) {
    const dependents = refusalData<{ dependents?: { id: string, name: string }[] }>(refused)?.dependents
    if (dependents?.length) {
      retiring.value = null
      hiding.value = { item, products: dependents }
      return
    }
    retireFailure.value = refusalText(refused)
  }
  finally {
    retireWorking.value = false
  }
}

async function setStatus(item: StockItem, status: 'ACTIVE' | 'RETIRED', hideDependents = false): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/admin/bar/items/${item.id}/status`, { method: 'POST', body: { status, hideDependents } })
    toast.add({
      title: status === 'RETIRED' ? `${item.name} is retired` : `${item.name} is back in stock`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    hiding.value = null
    await reload()
  }
  catch (refused) {
    const dependents = refusalData<{ dependents?: { id: string, name: string }[] }>(refused)?.dependents
    if (status === 'RETIRED' && !hideDependents && dependents?.length) {
      hiding.value = { item, products: dependents }
      return
    }
    // A refused hide leaves the modal in the way of its own explanation, so it closes first.
    hiding.value = null
    failure.value = refusalText(refused)
  }
}

async function remove(): Promise<void> {
  const item = removing.value
  if (!item) return

  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/bar/items/${item.id}`, { method: 'DELETE' })
    toast.add({ title: 'Stocked item deleted', icon: 'i-lucide-check', color: 'success' })
    removing.value = null
    await reload()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const listingFailure = useListFailure(error, 'The stocked items could not be read.')

const columns: TableColumn<StockItem>[] = [
  {
    id: 'name',
    header: 'Stocked item',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'flex flex-wrap items-center gap-2' }, [
        h('span', {}, row.original.name),
        row.original.status === 'RETIRED'
          ? h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => 'Retired')
          : null,
        row.original.ageRestricted
          ? h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm' }, () => 'Age restricted')
          : null,
      ]),
      h('div', { class: 'text-xs text-muted' }, row.original.containerMl
        ? `${says(row.original.unit)}, ${row.original.containerMl} ml a container`
        : says(row.original.unit)),
      // Below sm the on hand, par level, status and category columns are hidden: shown here
      // instead, so a phone keeps the row actions in view without losing what they said (922).
      h('div', { class: 'sm:hidden mt-1 text-xs text-muted' }, [
        `${saysQuantity(row.original.onHand, row.original.unit)} on hand`,
        row.original.parQty === null ? '' : `, par ${saysQuantity(row.original.parQty, row.original.unit)}`,
        stockStatus(row.original.onHand, row.original.parQty) === null ? '' : `, ${saysStockStatus(stockStatus(row.original.onHand, row.original.parQty)!).toLowerCase()}`,
        row.original.category ? `, ${row.original.category}` : '',
      ].join('')),
    ]),
  },
  {
    id: 'onHand',
    header: 'On hand',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} whitespace-nowrap` } },
    cell: ({ row }) => saysQuantity(row.original.onHand, row.original.unit),
  },
  {
    id: 'par',
    header: 'Par level',
    meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } },
    cell: ({ row }) => (row.original.parQty === null ? 'Not set' : saysQuantity(row.original.parQty, row.original.unit)),
  },
  {
    id: 'pouredBy',
    header: 'Poured by',
    meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } },
    cell: ({ row }) => (row.original.pouredBy.length === 0
      ? h('span', { class: 'text-muted' }, 'Nothing on the till')
      : h('div', { 'class': 'flex flex-wrap gap-1', 'data-test': `poured-by-${row.original.id}` },
          row.original.pouredBy.map(product => h(UButton, {
            size: 'sm',
            color: 'neutral',
            variant: 'ghost',
            to: `/bar/products/${product.id}`,
          }, () => product.name)))),
  },
  {
    id: 'status',
    header: 'Status',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} whitespace-nowrap` } },
    cell: ({ row }) => {
      const status = stockStatus(row.original.onHand, row.original.parQty)
      if (status === null) return null
      const color = status === 'OUT' ? 'error' : status === 'BELOW_PAR' ? 'warning' : 'success'
      return h(UBadge, { 'color': color, 'variant': 'subtle', 'size': 'sm', 'data-test': `status-badge-${row.original.id}` }, () => saysStockStatus(status))
    },
  },
  {
    id: 'category',
    header: 'Stock group',
    meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } },
    cell: ({ row }) => row.original.category ?? '',
  },
  {
    id: 'act',
    header: ACTIONS_HEADER,
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
      row.original.status === 'ACTIVE'
        ? h(UButton, {
            'size': 'sm',
            'color': 'neutral',
            'variant': 'ghost',
            'data-test': `move-${row.original.id}`,
            'onClick': () => moveStock(row.original),
          }, () => 'Record a movement')
        : null,
      h(UButton, {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `edit-${row.original.id}`,
        'onClick': () => edit(row.original),
      }, () => 'Edit'),
      h(UButton, {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `status-${row.original.id}`,
        'onClick': () => {
          if (row.original.status === 'RETIRED') return void setStatus(row.original, 'ACTIVE')
          retireFailure.value = null
          retiring.value = row.original
        },
      }, () => (row.original.status === 'RETIRED' ? 'Bring back' : 'Retire')),
      rowOverflow(row.original.id, row.original.hasMovements
        ? []
        : [{
            label: 'Delete',
            color: 'error',
            onSelect: () => {
              failure.value = null
              removing.value = row.original
            },
          }]),
    ]),
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
      v-if="failure && !open && moving === null && removing === null"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <p class="text-sm text-muted">
      What is stocked, and how much of it is on hand.
    </p>

    <AdminToolbar
      v-model:search="search"
      placeholder="A stocked item"
      :active="active"
      :loading="status === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="barItemsList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
      </template>

      <template #actions>
        <UButton
          data-test="add-item"
          icon="i-lucide-plus"
          @click="edit(null)"
        >
          Add a stocked item
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="data.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="bar-items-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ filtered ? 'No stocked item matches that.' : 'No stocked items yet. Add what the bar counts, then record a delivery.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="bar-items-total"
        class="text-sm text-muted"
      >
        {{ plural(data.total, 'stocked item') }}
      </p>
      <UPagination
        v-if="data.pages > 1"
        v-model:page="page"
        :total="data.total"
        :items-per-page="data.pageSize"
      />
    </div>

    <UModal
      v-model:open="open"
      :title="editing ? `Edit ${editing.name}` : 'Add a stocked item'"
      description="A stocked item is what the bar counts. Its unit and container size are fixed once stock has moved."
    >
      <template #body>
        <UForm
          :schema="stockItemForm"
          :state="state"
          class="space-y-4"
          data-test="item-form"
          @submit="save"
        >
          <UAlert
            v-if="failure"
            data-test="form-failure"
            color="error"
            variant="subtle"
            :description="failure"
          />

          <UFormField
            label="Name"
            name="name"
            required
            description="What the cellar list calls it. House red 750ml, Lager keg, Crisps."
          >
            <UInput
              v-model="state.name"
              class="w-full"
              data-test="item-name"
            />
          </UFormField>

          <UFormField
            label="Counted in"
            name="unit"
            required
            :description="editing?.hasMovements ? 'Fixed: this item has stock movements stated in it.' : 'Millilitres for anything poured, whole items for anything counted.'"
          >
            <USelect
              v-model="state.unit"
              :items="unitOptions"
              :disabled="editing?.hasMovements"
              class="w-full"
              data-test="item-unit"
            />
          </UFormField>

          <UFormField
            v-if="state.unit === 'ML'"
            label="Container size"
            name="containerMl"
            hint="Optional"
            description="Millilitres in one bottle or keg, so a delivery can be counted in containers."
          >
            <UInputNumber
              v-model="state.containerMl"
              :min="1"
              :disabled="editing?.hasMovements"
              class="w-full"
              data-test="item-container"
            />
          </UFormField>

          <UFormField
            label="Par level"
            name="parQty"
            hint="Optional"
            description="What the bar wants on hand before a show week. An item without one is left out of the order list."
          >
            <UInputNumber
              v-model="state.parQty"
              :min="0"
              class="w-full"
              data-test="item-par"
            />
          </UFormField>

          <UFormField
            label="Stock group"
            name="category"
            hint="Optional"
            description="Free text, for grouping the order list, and not a product category."
          >
            <UInput
              v-model="state.category"
              class="w-full"
              data-test="item-category"
            />
          </UFormField>

          <UFormField
            label="Allergen notes"
            name="allergenNotes"
            hint="Optional"
            description="The reference a product's own note is written from."
          >
            <UTextarea
              v-model="state.allergenNotes"
              :rows="2"
              class="w-full"
              data-test="item-allergens"
            />
          </UFormField>

          <USwitch
            v-model="state.ageRestricted"
            label="Age restricted"
            description="Anything alcoholic. A product made of it should be restricted too."
            data-test="item-age-restricted"
          />

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="item-submit"
            >
              {{ editing ? 'Save the item' : 'Add an item' }}
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="open = false"
            >
              {{ CONFIRM_BACK_LABEL }}
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      :open="moving !== null"
      :title="moving ? `Record a movement for ${moving.name}` : ''"
      description="A movement is written once and never edited. Correct one from the movement history instead."
      @update:open="moving = null; failure = null"
    >
      <template #body>
        <UForm
          :schema="movementEntryForm"
          :state="movement"
          class="space-y-4"
          data-test="movement-form"
          @submit="record"
        >
          <UAlert
            v-if="failure"
            data-test="movement-failure"
            color="error"
            variant="subtle"
            :description="failure"
          />

          <UFormField
            label="What happened"
            name="kind"
            required
          >
            <USelect
              v-model="movement.kind"
              :items="kindOptions"
              class="w-full"
              data-test="movement-kind"
            />
          </UFormField>

          <UFormField
            v-if="movement.kind === 'ADJUST'"
            label="Which way"
            name="adds"
            description="Stock is found as often as it is lost, so an adjustment goes either way."
          >
            <USelect
              v-model="movement.adds"
              :items="directionOptions"
              class="w-full"
              data-test="movement-direction"
            />
          </UFormField>

          <UFormField
            label="Quantity"
            name="qty"
            required
            :description="`In ${moving ? says(moving.unit).toLowerCase() : 'the item\'s own unit'}. This ${adding ? 'adds to' : 'comes off'} what is on hand.`"
          >
            <UInputNumber
              v-model="movement.qty"
              :min="1"
              class="w-full"
              data-test="movement-qty"
            />
          </UFormField>

          <UFormField
            v-if="movement.kind === 'DELIVERY' && byContainer"
            label="Cost a container"
            name="unitCostPence"
            :description="`In pounds, for the whole ${moving?.containerMl} ml container. Divided to a cost per ml, what gross profit is measured against.`"
          >
            <UInputNumber
              v-model="containerPounds"
              :min="0"
              :step="0.01"
              :format-options="{ style: 'currency', currency: 'GBP' }"
              class="w-full"
              data-test="movement-cost"
            />
          </UFormField>

          <UFormField
            v-else-if="movement.kind === 'DELIVERY'"
            label="Cost a unit"
            name="unitCostPence"
            description="In pounds, for what was actually paid. This is what gross profit is measured against."
          >
            <UInputNumber
              v-model="pounds"
              :min="0"
              :step="0.01"
              :format-options="{ style: 'currency', currency: 'GBP' }"
              class="w-full"
              data-test="movement-cost"
            />
          </UFormField>

          <UFormField
            v-else
            label="Reason"
            name="reason"
            required
            description="From the list, so the waste report can group it."
          >
            <USelect
              v-model="movement.reason"
              :items="reasonOptions"
              class="w-full"
              data-test="movement-reason"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="movement-submit"
            >
              Record the movement
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="moving = null"
            >
              {{ CONFIRM_BACK_LABEL }}
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      :open="hiding !== null"
      :title="hiding ? `Retire ${hiding.item.name}` : ''"
      description="The till still pours this. Retiring it takes what pours it off the till at the same time."
      data-test="hide-dependents"
      @update:open="hiding = null"
    >
      <template #body>
        <p class="text-sm">
          {{ hiding?.item.name }} is poured by
          {{ hiding?.products.map(product => product.name).join(', ') }}.
          Retiring it hides those products too. Their recipes, prices and history are
          untouched, and bringing the item back is a separate decision.
        </p>
      </template>

      <template #footer>
        <UButton
          color="error"
          data-test="confirm-hide-dependents"
          @click="hiding && setStatus(hiding.item, 'RETIRED', true)"
        >
          Retire the item and hide the products
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="hiding = null"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="removing !== null"
      :title="removing ? `Delete ${removing.name}` : ''"
      description="Nothing has ever moved against this item, so there is no history to keep."
      @update:open="removing = null; failure = null"
    >
      <template #body>
        <UAlert
          v-if="failure"
          data-test="delete-failure"
          color="error"
          variant="subtle"
          :description="failure"
        />
        <p
          v-else
          class="text-sm text-muted"
        >
          The item goes. The rest of the stock list stays, and no count changes.
        </p>
      </template>

      <template #footer>
        <UButton
          color="error"
          :loading="saving"
          data-test="confirm-delete"
          @click="remove"
        >
          Delete the item
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="removing = null"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </template>
    </UModal>

    <ConfirmModal
      :open="retiring !== null"
      name="retire-item"
      :title="retiring ? `Retire ${retiring.name}` : ''"
      :verb="retiring ? `Retire ${retiring.name}` : ''"
      consequence="It leaves the stock list and nothing new may be counted against it. Its movements stay."
      :loading="retireWorking"
      :failure="retireFailure"
      @update:open="value => { if (!value) retiring = null }"
      @confirm="retire"
    />
  </div>
</template>
