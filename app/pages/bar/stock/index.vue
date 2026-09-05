<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import {
  HAND_ENTERED_KINDS,
  MOVEMENT_REASONS,
  STOCK_UNITS,
  movementEntryForm,
  says,
  saysQuantity,
  stockItemForm,
} from '#shared/utils/bar'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { MovementReason, StockItem, StockMovementKind, StockUnit } from '#shared/utils/bar'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Stocked items', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const request = useRequestFetch()
const toast = useToast()
const search = ref('')
const includeRetired = ref(true)
const page = ref(1)
const failure = ref<string | null>(null)
const saving = ref(false)

interface Listing { items: StockItem[], total: number, pageSize: number, pages: number }

const empty = (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 })

const { data, status, error, refresh } = await useAsyncData(
  'bar-items',
  () => request<Listing>('/api/admin/bar/items', {
    query: { includeRetired: includeRetired.value, search: search.value.trim() || undefined, page: page.value },
  }),
  { watch: [page], default: empty },
)

watch([search, includeRetired], () => {
  if (page.value === 1) void refresh()
  else page.value = 1
})

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
const reasonOptions = MOVEMENT_REASONS.map(value => ({ label: says(value), value }))
const directionOptions = [{ label: 'Add to stock', value: true }, { label: 'Take off stock', value: false }]

// The field takes pounds and the request carries pence, converted here and nowhere else (0004).
// Undefined stays undefined: a delivery whose cost nobody entered records none rather than nought.
const pounds = computed({
  get: () => (movement.unitCostPence === undefined ? undefined : movement.unitCostPence / 100),
  set: (value: number | undefined) => {
    movement.unitCostPence = value === undefined ? undefined : Math.round(value * 100)
  },
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

async function setStatus(item: StockItem, status: 'ACTIVE' | 'RETIRED'): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/admin/bar/items/${item.id}/status`, { method: 'POST', body: { status } })
    toast.add({
      title: status === 'RETIRED' ? `${item.name} is retired` : `${item.name} is back in stock`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    await reload()
  }
  catch (refused) {
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

const listingFailure = computed(() => (error.value ? refusalText(error.value, 'The stocked items could not be read.') : null))

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  if (!includeRetired.value) {
    active.push({ key: 'retired', label: 'Hiding retired', icon: 'i-lucide-archive', clear: () => {
      includeRetired.value = true
    } })
  }
  return active
})

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
    ]),
  },
  {
    id: 'onHand',
    header: 'On hand',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => saysQuantity(row.original.onHand, row.original.unit),
  },
  {
    id: 'par',
    header: 'Par level',
    cell: ({ row }) => (row.original.parQty === null ? 'Not set' : saysQuantity(row.original.parQty, row.original.unit)),
  },
  {
    id: 'category',
    header: 'Category',
    cell: ({ row }) => row.original.category ?? '',
  },
  {
    id: 'act',
    header: '',
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
        'onClick': () => setStatus(row.original, row.original.status === 'RETIRED' ? 'ACTIVE' : 'RETIRED'),
      }, () => (row.original.status === 'RETIRED' ? 'Put back' : 'Retire')),
      row.original.hasMovements
        ? null
        : h(UButton, {
            'size': 'sm',
            'color': 'error',
            'variant': 'ghost',
            'data-test': `delete-${row.original.id}`,
            'onClick': () => {
              failure.value = null
              removing.value = row.original
            },
          }, () => 'Delete'),
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
      :description="listingFailure"
    />

    <UAlert
      v-if="failure && !open && moving === null && removing === null"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-package"
      title="On hand is the sum of the movements"
      description="Nothing stores a stock figure. Every quantity here is added up from the movement history, so a mistake is corrected with a reversing movement and the original stays where it is."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A stocked item"
      :active="activeFilters"
      :loading="status === 'pending'"
      @clear="search = ''; includeRetired = true"
    >
      <template #filters>
        <UFormField label="Show">
          <USwitch
            v-model="includeRetired"
            label="Including retired items"
            data-test="items-retired"
          />
        </UFormField>
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
          {{ search ? 'No stocked item matches that.' : 'No stocked items yet. Add what the bar counts, then record a delivery.' }}
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
            label="Category"
            name="category"
            hint="Optional"
            description="Free text, for grouping the order list; not the till's own categories."
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
              {{ editing ? 'Save it' : 'Add it' }}
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="open = false"
            >
              Back
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
            v-if="movement.kind === 'DELIVERY'"
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
            description="From the list, so waste can be reported on rather than read."
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
              Record it
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="moving = null"
            >
              Back
            </UButton>
          </div>
        </UForm>
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
          This cannot be undone, and there is nothing behind it to lose.
        </p>
      </template>

      <template #footer>
        <UButton
          color="error"
          :loading="saving"
          data-test="confirm-delete"
          @click="remove"
        >
          Delete it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="removing = null"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </div>
</template>
