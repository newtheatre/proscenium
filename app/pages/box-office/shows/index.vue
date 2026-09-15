<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { saysReferenceName, saysShowDates, saysShowSeasonLine, saysShowStanding, saysShowVenues, showForm, toSlug } from '#shared/utils/programme'
import { saysHouse, soldShare } from '#shared/utils/show-strip'
import { showsList } from '#shared/utils/shows-list'
import { MAX_PAGE_SIZE } from '#shared/utils/pagination'
import type { TableColumn } from '@nuxt/ui'
import type { FilterOption } from '#shared/utils/list-filters'
import type { AdminShow, ShowsStandingCounts } from '#shared/utils/programme'

definePageMeta({ layout: 'console', title: 'Shows', middleware: 'console', docs: '/docs/box-office/shows-and-performances' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UProgress = resolveComponent('UProgress')

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const saving = ref(false)
const open = ref(false)

interface Listing { items: AdminShow[], total: number, pageSize: number, pages: number, standings: ShowsStandingCounts }
interface Named { items: { id: string, name: string, archived: boolean }[] }

const empty = (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1, standings: { onSale: 0, drafts: 0 } })

// The season and category pickers read the reference data once, the largest page of each;
// the table names a show's own season from its row, so nothing here limits what it can say.
const { data: reference } = await useAsyncData(
  'box-office-shows-reference',
  async () => {
    const [seasons, categories] = await Promise.all([
      request<Named>('/api/admin/reference-data/seasons', { query: { pageSize: MAX_PAGE_SIZE } }),
      request<Named>('/api/admin/reference-data/show-categories', { query: { pageSize: MAX_PAGE_SIZE } }),
    ])
    const named = (rows: Named): FilterOption[] => rows.items.map(row => ({ value: row.id, label: saysReferenceName(row) }))
    return { seasonId: named(seasons), categoryId: named(categories) }
  },
  { default: (): Record<string, FilterOption[]> => ({ seasonId: [], categoryId: [] }) },
)

// Search, filters, sort and page live in the URL (K-129); the list refetches when any changes.
const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(showsList, { options: reference })

// Searched and paged in SQL, so what the table shows and what the count says are the same
// question asked once (CONTRIBUTING).
const { data, status: loading, error } = await useAsyncData(
  'box-office-shows',
  () => request<Listing>('/api/admin/shows', { query: query.value }),
  { watch: [query], default: empty },
)

const state = reactive({ title: '', slug: '' })

// The address follows the title until somebody types one, because a slug edited by hand is a
// deliberate choice and retyping the title must not undo it.
const slugEdited = ref(false)
watch(() => state.title, (title) => {
  if (!slugEdited.value) state.slug = toSlug(title)
})

function add(): void {
  failure.value = null
  slugEdited.value = false
  Object.assign(state, { title: '', slug: '' })
  open.value = true
}

async function create(): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    const answer = await $fetch<{ id: string }>('/api/admin/shows', {
      method: 'POST',
      body: { title: state.title.trim(), slug: state.slug.trim() },
    })
    toast.add({ title: 'Show added', description: 'It is a draft until you publish it.', icon: 'i-lucide-check', color: 'success' })
    open.value = false
    await navigateTo(`/box-office/shows/${answer.id}`)
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

// A listing that refused says so, or the table quietly keeps showing rows the filters no longer
// describe.
const listingFailure = computed(() => (error.value ? refusalText(error.value, 'The shows could not be read.') : null))

const columns: TableColumn<AdminShow>[] = [
  {
    id: 'title',
    header: 'Show',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.title),
      h('div', { class: 'text-xs text-muted' }, `/shows/${row.original.slug}`),
      // Below sm the dates, status and reserved columns are hidden: said here instead, so a phone
      // keeps the row actions in view (922). The venue is one tap away rather than past the edge.
      h('div', { class: 'sm:hidden mt-1 max-w-56 text-xs text-muted' }, [
        saysShowStanding(row.original).says,
        saysShowDates(row.original.firstPerformanceAt, row.original.lastPerformanceAt),
        saysHouse(row.original.soldTickets, row.original.capacity),
      ].join(' \u00b7 ')),
    ]),
  },
  {
    id: 'dates',
    header: 'Dates',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} whitespace-nowrap text-sm` } },
    cell: ({ row }) => saysShowDates(row.original.firstPerformanceAt, row.original.lastPerformanceAt),
  },
  {
    id: 'venue',
    header: 'Venue',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} text-sm text-muted` } },
    cell: ({ row }) => saysShowVenues(row.original.venueNames),
  },
  {
    id: 'status',
    header: 'Status',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} whitespace-nowrap` } },
    cell: ({ row }) => {
      const standing = saysShowStanding(row.original)
      return h(UBadge, { 'color': standing.colour, 'variant': 'subtle', 'size': 'sm', 'data-test': `standing-${row.original.id}` }, () => standing.says)
    },
  },
  {
    id: 'reserved',
    header: 'Reserved',
    meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } },
    // The bar is decoration over the figure and never instead of it: a meter with no number is a
    // colour, and a colour is not a state (K-101).
    cell: ({ row }) => {
      const share = soldShare(row.original.soldTickets, row.original.capacity)
      const says = saysHouse(row.original.soldTickets, row.original.capacity)
      if (share === null) return h('span', { class: 'text-sm text-muted' }, says)
      return h('div', { class: 'flex items-center gap-2' }, [
        h(UProgress, { modelValue: share, size: 'sm', class: 'hidden w-16 lg:block' }),
        h('span', { class: 'whitespace-nowrap text-sm tabular-nums' }, says),
      ])
    },
  },
  {
    id: 'act',
    header: () => h('span', { class: 'sr-only' }, 'Actions'),
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h(UButton, {
      'size': 'sm',
      'color': 'neutral',
      'variant': 'ghost',
      'to': `/box-office/shows/${row.original.id}`,
      'data-test': `open-${row.original.id}`,
    }, () => 'Edit'),
  },
]

// The season the filter has been narrowed to, named from the picker's own options so the heading
// says what the reader chose rather than what one row happens to carry.
const seasonName = computed(() => {
  const chosen = conditions.value.find(one => one.key === 'seasonId' && one.operator === 'is')
  if (chosen?.values.length !== 1) return null
  return reference.value.seasonId?.find(option => option.value === chosen.values[0])?.label ?? null
})

const seasonLine = computed(() => saysShowSeasonLine(
  data.value.total,
  data.value.standings.onSale,
  data.value.standings.drafts,
  seasonName.value,
))

// Drafts with no artwork, named on the page that can do something about it: a draft going on sale
// looking like every other show is what the poster card exists to prevent (D-132 criterion 6).
const artless = computed(() => data.value.items.filter(one => one.status === 'DRAFT' && one.posterUrl === null))
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

    <div>
      <h2 class="text-lg font-semibold">
        Shows
      </h2>
      <p
        class="text-sm text-muted"
        data-test="shows-season-line"
      >
        {{ seasonLine }}
      </p>
    </div>

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-drama"
      title="Nothing goes on sale by accident"
      description="A show is a draft, invisible to the public, until you publish it. Publishing can take its performances on sale in one action, and a cancelled performance is never swept back on sale with them."
    />

    <AdminToolbar
      v-model:search="search"
      :placeholder="showsList.search?.placeholder"
      :active="active"
      :loading="loading === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="showsList"
          :conditions="conditions"
          :sort="sort"
          :options="reference"
          @set="set"
          @sort="setSort"
        />
      </template>

      <template #actions>
        <UButton
          data-test="add-show"
          icon="i-lucide-plus"
          @click="add"
        >
          Add a show
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="data.items"
      :columns="columns"
      :loading="loading === 'pending'"
      data-test="shows-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ filtered ? 'No show matches that.' : 'No shows yet. Add one, give it performances, then publish it.' }}
        </p>
      </template>
    </UTable>

    <UAlert
      v-if="artless.length"
      color="warning"
      variant="subtle"
      icon="i-lucide-image-off"
      data-test="shows-artless"
      :title="`${plural(artless.length, 'draft')} with no poster`"
      :description="`${artless.map(one => one.title).join(', ')}. A draft can go on sale without artwork, but it will show its own gradient everywhere until one is uploaded.`"
    />

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="shows-total"
        class="text-sm text-muted"
      >
        {{ plural(data.total, 'show') }}
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
      title="Add a show"
      description="A title and the address its public page will have. Everything else is on the show's own screen, and it stays a draft until you publish it."
    >
      <template #body>
        <UForm
          :schema="showForm"
          :state="state"
          class="space-y-4"
          data-test="show-form"
          @submit="create"
        >
          <UAlert
            v-if="failure"
            data-test="form-failure"
            color="error"
            variant="subtle"
            :description="failure"
          />

          <UFormField
            label="Title"
            name="title"
            required
          >
            <UInput
              v-model="state.title"
              class="w-full"
              data-test="show-title"
            />
          </UFormField>

          <UFormField
            label="Address"
            name="slug"
            required
            description="The public page is /shows/ and this. Lowercase words joined by hyphens."
          >
            <UInput
              v-model="state.slug"
              class="w-full"
              data-test="show-slug"
              @update:model-value="slugEdited = true"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="show-submit"
            >
              Add it
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
  </div>
</template>
