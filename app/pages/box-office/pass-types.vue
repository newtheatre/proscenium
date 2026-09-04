<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { endOfLondonDay, formatLondon, londonParts, startOfLondonDay } from '#shared/utils/london'
import {
  PASS_TYPE_STATUSES,
  newPassTypeScreenForm,
  passTypeScreenForm,
  saysPassTypeStatus,
} from '#shared/utils/pass-types'
import { saysPrice } from '#shared/utils/ticket-types'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'
import type { PassType, PassTypeStatus } from '#shared/utils/pass-types'

definePageMeta({ layout: 'console', title: 'Passes', middleware: 'console' })

interface ShowOption { id: string, title: string, status: string }

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const request = useRequestFetch()
const toast = useToast()
const search = ref('')
const status = ref<PassTypeStatus | 'ALL'>('ALL')
const page = ref(1)
const failure = ref<string | null>(null)
const saving = ref(false)

interface Listing { items: PassType[], total: number, pageSize: number, pages: number }

const empty = (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 })

// Searched and paged in SQL, so what the table shows and what the count says are the same
// question asked once (CONTRIBUTING).
const { data, status: loading, error, refresh } = await useAsyncData(
  'pass-types',
  () => request<Listing>('/api/admin/pass-types', {
    query: {
      search: search.value.trim() || undefined,
      status: status.value === 'ALL' ? undefined : status.value,
      page: page.value,
    },
  }),
  { watch: [page], default: empty },
)

const { data: shows } = await useAsyncData('pass-type-shows', () => request<ShowOption[]>('/api/admin/programme/shows'), { default: () => [] })
const showOptions = computed(() => shows.value.map(one => ({ label: one.title, value: one.id })))

watch([search, status], () => {
  if (page.value === 1) void refresh()
  else page.value = 1
})

async function reload(): Promise<void> {
  await refresh()
  if (page.value > data.value.pages) page.value = data.value.pages
}

const statusOptions = [
  { label: 'Any status', value: 'ALL' as const },
  ...PASS_TYPE_STATUSES.map(one => ({ label: saysPassTypeStatus(one), value: one })),
]

// A date-only field, midnight London, because a pass's window is a season rather than an instant.
function isoDate(at: number | null): string {
  if (at === null) return ''
  const { year, month, day } = londonParts(new Date(at * 1000))
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function startOfDay(iso: string): number | null {
  return iso ? Math.floor(startOfLondonDay(iso).getTime() / 1000) : null
}

function endOfDay(iso: string): number | null {
  return iso ? Math.floor(endOfLondonDay(iso).getTime() / 1000) : null
}

interface PriceRow { label: string, pounds: number }

const editing = ref<PassType | null>(null)
const open = ref(false)
const removing = ref<PassType | null>(null)
const managingShows = ref<PassType | null>(null)
const showsFailure = ref<string | null>(null)
const showsSaving = ref(false)
const chosenShowIds = ref<string[]>([])

watch(open, (isOpen) => {
  if (!isOpen) failure.value = null
})

const state = reactive({
  name: '',
  slug: '',
  description: '',
  validFrom: '',
  validUntil: '',
  salesOpenAt: '',
  salesCloseAt: '',
  maxIssued: null as number | null,
  status: 'DRAFT' as PassTypeStatus,
  showIds: [] as string[],
})

const priceRows = ref<PriceRow[]>([{ label: '', pounds: 0 }])

function addPriceRow(): void {
  priceRows.value.push({ label: '', pounds: 0 })
}

function removePriceRow(index: number): void {
  priceRows.value.splice(index, 1)
}

function edit(passType: PassType | null): void {
  editing.value = passType
  failure.value = null
  Object.assign(state, {
    name: passType?.name ?? '',
    slug: passType?.slug ?? '',
    description: passType?.description ?? '',
    validFrom: isoDate(passType?.validFrom ?? null),
    validUntil: isoDate(passType?.validUntil ?? null),
    salesOpenAt: isoDate(passType?.salesOpenAt ?? null),
    salesCloseAt: isoDate(passType?.salesCloseAt ?? null),
    maxIssued: passType?.maxIssued ?? null,
    status: passType?.status ?? 'DRAFT',
    showIds: passType?.showIds ?? [],
  })
  priceRows.value = passType && passType.prices.length > 0
    ? passType.prices.map(price => ({ label: price.label, pounds: price.price / 100 }))
    : [{ label: '', pounds: 0 }]
  open.value = true
}

async function save(): Promise<void> {
  saving.value = true
  failure.value = null
  const prices = priceRows.value
    .filter(row => row.label.trim().length > 0)
    .map(row => ({ label: row.label.trim(), price: Math.round(row.pounds * 100) }))
  const body = {
    name: state.name.trim(),
    slug: state.slug.trim(),
    description: state.description.trim() || null,
    validFrom: startOfDay(state.validFrom),
    validUntil: endOfDay(state.validUntil),
    salesOpenAt: startOfDay(state.salesOpenAt),
    salesCloseAt: endOfDay(state.salesCloseAt),
    maxIssued: state.maxIssued,
    prices,
  }
  try {
    if (editing.value) {
      await $fetch(`/api/admin/pass-types/${editing.value.id}`, { method: 'PUT', body: { ...body, status: state.status } })
    }
    else {
      await $fetch('/api/admin/pass-types', { method: 'POST', body: { ...body, showIds: state.showIds } })
    }
    toast.add({ title: editing.value ? 'Pass changed' : 'Pass added', icon: 'i-lucide-check', color: 'success' })
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

async function remove(): Promise<void> {
  const passType = removing.value
  if (!passType) return

  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/pass-types/${passType.id}`, { method: 'DELETE' })
    toast.add({ title: 'Pass deleted', icon: 'i-lucide-check', color: 'success' })
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

function openShows(passType: PassType): void {
  managingShows.value = passType
  showsFailure.value = null
  chosenShowIds.value = [...passType.showIds]
}

// The full set is replaced in one call; the endpoint gates a removal that would drop a show with
// a live pass against it behind the manager permission (D-123 criterion 4).
async function saveShows(): Promise<void> {
  const passType = managingShows.value
  if (!passType) return

  showsSaving.value = true
  showsFailure.value = null
  try {
    await $fetch(`/api/admin/pass-types/${passType.id}/shows`, { method: 'PUT', body: { showIds: chosenShowIds.value } })
    toast.add({ title: 'Covered shows changed', icon: 'i-lucide-check', color: 'success' })
    managingShows.value = null
    await reload()
  }
  catch (refused) {
    showsFailure.value = refusalText(refused)
  }
  finally {
    showsSaving.value = false
  }
}

const listingFailure = computed(() => (error.value ? refusalText(error.value, 'The passes could not be read.') : null))

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  if (status.value !== 'ALL') {
    active.push({ key: 'status', label: saysPassTypeStatus(status.value), icon: 'i-lucide-filter', clear: () => {
      status.value = 'ALL'
    } })
  }
  return active
})

const columns: TableColumn<PassType>[] = [
  {
    id: 'name',
    header: 'Pass',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'flex flex-wrap items-center gap-2' }, [
        h('span', {}, row.original.name),
        h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => saysPassTypeStatus(row.original.status)),
        row.original.everIssued
          ? h(UBadge, { color: 'info', variant: 'subtle', size: 'sm' }, () => 'Issued')
          : null,
      ]),
      h('div', { class: 'text-xs text-muted' }, `${formatLondon(new Date(row.original.validFrom * 1000), { dateStyle: 'medium' })} – ${formatLondon(new Date(row.original.validUntil * 1000), { dateStyle: 'medium' })}`),
    ]),
  },
  {
    id: 'prices',
    header: 'Price points',
    cell: ({ row }) => h('span', { class: 'text-sm' }, row.original.prices.map(price => `${price.label} ${saysPrice(price.price)}`).join(', ')),
  },
  {
    id: 'cap',
    header: 'Cap',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => h('span', { class: 'text-sm' }, row.original.maxIssued === null ? 'Uncapped' : `${row.original.maxIssued}`),
  },
  {
    id: 'shows',
    header: 'Covers',
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, plural(row.original.showIds.length, 'show')),
  },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
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
        'data-test': `shows-${row.original.id}`,
        'onClick': () => openShows(row.original),
      }, () => 'Shows'),
      row.original.everIssued
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
      v-if="failure && !open && removing === null"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-wallet-cards"
      title="A pass is closed, never destroyed, once anything has been issued against it"
      description="A pass nothing has ever been issued under can be deleted outright. Extending what a pass covers is free; dropping a show with a live pass against it needs a manager."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A pass"
      :active="activeFilters"
      :loading="loading === 'pending'"
      @clear="search = ''; status = 'ALL'"
    >
      <template #filters>
        <UFormField label="Status">
          <USelect
            v-model="status"
            :items="statusOptions"
            value-key="value"
            class="w-48"
            data-test="pass-types-status"
          />
        </UFormField>
      </template>

      <template #actions>
        <UButton
          data-test="add-pass-type"
          icon="i-lucide-plus"
          @click="edit(null)"
        >
          Add a pass
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="data.items"
      :columns="columns"
      :loading="loading === 'pending'"
      data-test="pass-types-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ search ? 'No pass matches that.' : 'No passes yet. Add one and it has something to cover.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="pass-types-total"
        class="text-sm text-muted"
      >
        {{ plural(data.total, 'pass') }}
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
      :title="editing ? `Edit ${editing.name}` : 'Add a pass'"
      description="Name, description, windows, price points and status can all change later. What it covers moves separately."
    >
      <template #body>
        <UForm
          :schema="editing ? passTypeScreenForm : newPassTypeScreenForm"
          :state="state"
          class="space-y-4"
          data-test="pass-type-form"
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
          >
            <UInput
              v-model="state.name"
              class="w-full"
              data-test="pass-type-name"
            />
          </UFormField>

          <UFormField
            label="Address"
            name="slug"
            required
            description="Lowercase words joined by hyphens."
          >
            <UInput
              v-model="state.slug"
              class="w-full"
              data-test="pass-type-slug"
            />
          </UFormField>

          <UFormField
            label="What it is for"
            name="description"
            hint="Optional"
          >
            <UTextarea
              v-model="state.description"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField
              label="Valid from"
              name="validFrom"
              required
            >
              <DateField
                v-model="state.validFrom"
                data-test="pass-type-valid-from"
              />
            </UFormField>
            <UFormField
              label="Valid until"
              name="validUntil"
              required
            >
              <DateField
                v-model="state.validUntil"
                data-test="pass-type-valid-until"
              />
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormField
              label="Sales open"
              name="salesOpenAt"
              hint="Optional"
            >
              <DateField v-model="state.salesOpenAt" />
            </UFormField>
            <UFormField
              label="Sales close"
              name="salesCloseAt"
              hint="Optional"
            >
              <DateField v-model="state.salesCloseAt" />
            </UFormField>
          </div>

          <UFormField
            label="Maximum issued"
            name="maxIssued"
            hint="Optional"
            description="Uncapped if left blank. The blunt guard against selling more than the house holds."
          >
            <UInputNumber
              v-model="state.maxIssued"
              :min="1"
              class="w-full"
              data-test="pass-type-cap"
            />
          </UFormField>

          <UFormField
            v-if="editing"
            label="Status"
            name="status"
          >
            <USelect
              v-model="state.status"
              :items="PASS_TYPE_STATUSES.map(one => ({ label: saysPassTypeStatus(one), value: one }))"
              value-key="value"
              class="w-full"
              data-test="pass-type-status"
            />
          </UFormField>

          <UFormField
            label="Price points"
            name="prices"
            description="At least one, each with its own label."
          >
            <div class="space-y-2">
              <div
                v-for="(row, index) in priceRows"
                :key="index"
                class="flex items-center gap-2"
              >
                <UInput
                  v-model="row.label"
                  placeholder="Standard"
                  class="flex-1"
                  :data-test="`pass-type-price-label-${index}`"
                />
                <UInputNumber
                  v-model="row.pounds"
                  :min="0"
                  :step="0.5"
                  :format-options="{ style: 'currency', currency: 'GBP' }"
                  class="w-40"
                  :data-test="`pass-type-price-amount-${index}`"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-x"
                  aria-label="Remove this price point"
                  :disabled="priceRows.length === 1"
                  @click="removePriceRow(index)"
                />
              </div>
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-plus"
                size="sm"
                data-test="pass-type-add-price"
                @click="addPriceRow"
              >
                Add a price point
              </UButton>
            </div>
          </UFormField>

          <UFormField
            v-if="!editing"
            label="Covers"
            name="showIds"
            required
            description="Which shows a pass of this type admits to."
          >
            <USelectMenu
              v-model="state.showIds"
              :items="showOptions"
              value-key="value"
              multiple
              placeholder="Search the programme"
              class="w-full"
              data-test="pass-type-shows"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="pass-type-submit"
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
      :open="removing !== null"
      :title="removing ? `Delete ${removing.name}` : ''"
      description="Nothing has ever been issued under this pass, so there is no history to keep."
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
          This cannot be undone.
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

    <UModal
      :open="managingShows !== null"
      :title="managingShows ? `What ${managingShows.name} covers` : ''"
      description="Adding a show takes effect at once. Removing one with a live pass against it needs a manager."
      @update:open="managingShows = null"
    >
      <template #body>
        <UAlert
          v-if="showsFailure"
          data-test="shows-failure"
          color="error"
          variant="subtle"
          :description="showsFailure"
        />
        <USelectMenu
          v-model="chosenShowIds"
          :items="showOptions"
          value-key="value"
          multiple
          placeholder="Search the programme"
          class="w-full"
          data-test="pass-type-shows-editor"
        />
      </template>

      <template #footer>
        <UButton
          :loading="showsSaving"
          data-test="save-shows"
          @click="saveShows"
        >
          Save it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="managingShows = null"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </div>
</template>
