<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { SHOW_STATUSES, saysShowStatus, showForm, toSlug } from '#shared/utils/programme'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'
import type { AdminShow, ShowStatus } from '#shared/utils/programme'

definePageMeta({ layout: 'console', title: 'Shows', middleware: 'console' })

const UBadge = resolveComponent('UBadge')

const request = useRequestFetch()
const toast = useToast()
const search = ref('')
const status = ref<ShowStatus | 'ALL'>('ALL')
const page = ref(1)
const failure = ref<string | null>(null)
const saving = ref(false)
const open = ref(false)

interface Listing { items: AdminShow[], total: number, pageSize: number, pages: number }

const empty = (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 })

// Searched and paged in SQL, so what the table shows and what the count says are the same
// question asked once (CONTRIBUTING).
const { data, status: loading, error, refresh } = await useAsyncData(
  'box-office-shows',
  () => request<Listing>('/api/admin/shows', {
    query: {
      search: search.value.trim() || undefined,
      status: status.value === 'ALL' ? undefined : status.value,
      page: page.value,
    },
  }),
  { watch: [page], default: empty },
)

watch([search, status], () => {
  if (page.value === 1) void refresh()
  else page.value = 1
})

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

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  if (status.value !== 'ALL') {
    active.push({ key: 'status', label: saysShowStatus(status.value), icon: 'i-lucide-eye', clear: () => {
      status.value = 'ALL'
    } })
  }
  return active
})

const statusOptions = [
  { label: 'Every show', value: 'ALL' },
  ...SHOW_STATUSES.map(one => ({ label: saysShowStatus(one), value: one })),
]

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
      placeholder="A show title or address"
      :active="activeFilters"
      :loading="loading === 'pending'"
      @clear="search = ''; status = 'ALL'"
    >
      <template #filters>
        <UFormField label="Show">
          <USelect
            v-model="status"
            :items="statusOptions"
            class="w-full"
            data-test="shows-status"
          />
        </UFormField>
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
          {{ search ? 'No show matches that.' : 'No shows yet. Add one, give it performances, then publish it.' }}
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
