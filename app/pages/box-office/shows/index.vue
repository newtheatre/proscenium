<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { saysReferenceName, saysShowStatus, showForm, toSlug } from '#shared/utils/programme'
import { showsList } from '#shared/utils/shows-list'
import { MAX_PAGE_SIZE } from '#shared/utils/pagination'
import type { TableColumn } from '@nuxt/ui'
import type { FilterOption } from '#shared/utils/list-filters'
import type { AdminShow } from '#shared/utils/programme'

definePageMeta({ layout: 'console', title: 'Shows', middleware: 'console' })

const UBadge = resolveComponent('UBadge')

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const saving = ref(false)
const open = ref(false)

interface Listing { items: AdminShow[], total: number, pageSize: number, pages: number }
interface Named { items: { id: string, name: string, archived: boolean }[] }

const empty = (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 })

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
      h('div', { class: 'flex flex-wrap items-center gap-2' }, [
        h('span', {}, row.original.title),
        h(UBadge, {
          color: row.original.status === 'PUBLISHED' ? 'success' : 'neutral',
          variant: 'subtle',
          size: 'sm',
        }, () => saysShowStatus(row.original.status)),
      ]),
      h('div', { class: 'text-xs text-muted' }, `/shows/${row.original.slug}`),
    ]),
  },
  {
    id: 'season',
    header: 'Season',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, row.original.seasonName ?? 'None'),
  },
  {
    id: 'performances',
    header: 'Performances',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => h('span', { class: 'text-sm' }, row.original.performanceCount === 0
      ? 'None yet'
      : `${plural(row.original.performanceCount, 'performance', 'performances')}, ${row.original.onSaleCount} on sale`),
  },
  {
    id: 'sold',
    header: 'Sold',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, plural(row.original.soldTickets, 'ticket')),
  },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h(resolveComponent('UButton'), {
      'size': 'sm',
      'color': 'neutral',
      'variant': 'ghost',
      'to': `/box-office/shows/${row.original.id}`,
      'data-test': `open-${row.original.id}`,
    }, () => 'Open'),
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
