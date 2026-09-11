<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { formatLondon } from '#shared/utils/london'
import { saysShiftRole, saysShiftStatus } from '#shared/utils/rota'
import { unfilledShiftsList } from '#shared/utils/unfilled-shifts-list'
import type { ShiftRole, ShiftStatus } from '#shared/utils/rota'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Unfilled shifts', middleware: 'console' })

const UButton = resolveComponent('UButton')

interface UnfilledShift {
  shiftId: string
  role: ShiftRole
  status: ShiftStatus
  venueName: string
  showTitle: string
  startsAt: number
  declineReason: string | null
}

interface Listing {
  items: UnfilledShift[]
  page: number
  pageSize: number
  total: number
  pages: number
}

interface Candidate { id: string, name: string, email: string, eligible: boolean }

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const assigning = ref<UnfilledShift | null>(null)
const submitting = ref(false)
const candidateSearch = ref('')
const candidateSettled = useDebounced(candidateSearch, 250)
const chosen = ref<Candidate | null>(null)

// Search, filters, sort and page live in the URL (K-129).
const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(unfilledShiftsList)

const empty = (): Listing => ({ items: [], page: 1, pageSize: 0, total: 0, pages: 1 })

const { data: listing, status, refresh } = await useAsyncData(
  'unfilled-shifts',
  () => request<Listing>('/api/admin/rota/shifts', { query: query.value }),
  { watch: [query], default: empty },
)

// Scoped to the shift being assigned: eligibility depends on the role, which changes with it.
const { data: candidateData, status: candidateStatus } = await useAsyncData(
  () => `shift-candidates-${assigning.value?.shiftId ?? 'none'}-${candidateSettled.value}`,
  () => (!assigning.value || candidateSettled.value.trim().length < 2)
    ? Promise.resolve({ items: [] as Candidate[] })
    : $fetch<{ items: Candidate[] }>(`/api/admin/rota/shifts/${assigning.value.shiftId}/candidates`, {
        query: { search: candidateSettled.value.trim() },
      }),
  { watch: [candidateSettled, assigning], default: (): { items: Candidate[] } => ({ items: [] }), getCachedData: () => undefined },
)

const options = computed(() => candidateData.value.items.map(candidate => ({ ...candidate, value: candidate.id, label: candidate.name })))

function spanOf(startsAt: number): string {
  return formatLondon(new Date(startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
}

function openAssign(row: UnfilledShift): void {
  assigning.value = row
  chosen.value = null
  candidateSearch.value = ''
  failure.value = null
}

function choose(option: Candidate | undefined): void {
  chosen.value = option ?? null
}

async function submitAssign(): Promise<void> {
  const row = assigning.value
  if (!row || !chosen.value) return
  submitting.value = true
  try {
    await $fetch(`/api/admin/rota/shifts/${row.shiftId}/assign`, { method: 'POST', body: { userId: chosen.value.id } })
    toast.add({
      title: 'Assigned',
      description: `${chosen.value.name} is on ${saysShiftRole(row.role).toLowerCase()}, ${row.showTitle}.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    assigning.value = null
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    submitting.value = false
  }
}

const columns: TableColumn<UnfilledShift>[] = [
  {
    id: 'shift',
    header: 'Shift',
    cell: ({ row }) => h('div', {}, [
      h('p', { class: 'font-medium' }, `${saysShiftRole(row.original.role)}, ${row.original.venueName}`),
      h('p', { class: 'text-sm text-muted' }, `${row.original.showTitle}, ${spanOf(row.original.startsAt)}`),
      ...(row.original.declineReason
        ? [h('p', { class: 'text-sm text-muted' }, `Declined: ${row.original.declineReason}`)]
        : []),
    ]),
  },
  { id: 'status', header: 'Status', cell: ({ row }) => saysShiftStatus(row.original.status) },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h(UButton, {
      'size': 'sm',
      'variant': 'subtle',
      'data-test': `assign-${row.original.shiftId}`,
      'onClick': () => openAssign(row.original),
    }, () => 'Assign'),
  },
]
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-user-round-x"
      title="Open and declined shifts"
      description="Nothing here reopens itself: assign somebody eligible, or leave it for a member to claim from their own rota."
    />

    <AdminToolbar
      v-model:search="search"
      :placeholder="unfilledShiftsList.search?.placeholder"
      :active="active"
      :loading="status === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="unfilledShiftsList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
      </template>
    </AdminToolbar>

    <UTable
      :data="listing.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="unfilled-shifts-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ filtered ? 'Nothing matches that.' : 'Nothing unfilled right now.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="unfilled-total"
        class="text-sm text-muted"
      >
        {{ plural(listing.total, 'shift') }} to fill
      </p>
      <UPagination
        v-if="listing.pages > 1"
        v-model:page="page"
        :total="listing.total"
        :items-per-page="listing.pageSize"
      />
    </div>

    <UModal
      :open="assigning !== null"
      title="Assign this shift"
      description="Search by name or address. Eligibility is checked live, the same gate self-claiming uses."
      @update:open="assigning = null"
    >
      <template #body>
        <div class="space-y-4">
          <UInputMenu
            class="w-full"
            :model-value="options.find(option => option.value === chosen?.id)"
            :items="options"
            :loading="candidateStatus === 'pending'"
            placeholder="Name or address"
            :search-input="{ icon: 'i-lucide-search' }"
            :content="{ hideWhenEmpty: true }"
            ignore-filter
            icon="i-lucide-user"
            data-test="assign-candidate"
            @update:model-value="choose"
            @update:search-term="value => candidateSearch = value"
          >
            <template #item-label="{ item }">
              <span class="flex items-center gap-1.5">
                {{ item.name }}
                <UBadge
                  :color="item.eligible ? 'success' : 'neutral'"
                  variant="subtle"
                  size="sm"
                >
                  {{ item.eligible ? 'Eligible' : 'Locked' }}
                </UBadge>
              </span>
            </template>

            <template #empty>
              <span class="text-sm text-muted">
                {{ candidateSearch.trim().length < 2 ? 'Type at least two characters' : 'Nobody matches that' }}
              </span>
            </template>
          </UInputMenu>

          <UButton
            :disabled="!chosen || !chosen.eligible"
            :loading="submitting"
            data-test="assign-submit"
            @click="submitAssign"
          >
            Assign
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
