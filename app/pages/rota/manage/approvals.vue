<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { saysWhenLong } from '#shared/utils/when'
import { saysShiftRole, shiftDeclineForm } from '#shared/utils/rota'
import { rotaApprovalsList } from '#shared/utils/rota-approvals-list'
import type { ShiftRole } from '#shared/utils/rota'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Approvals', middleware: 'console', docs: '/docs/rota/approvals' })

const UButton = resolveComponent('UButton')

interface PendingApproval {
  shiftId: string
  role: ShiftRole
  performanceId: string
  venueName: string
  showTitle: string
  startsAt: number
  claimantName: string
}

interface Listing {
  items: PendingApproval[]
  page: number
  pageSize: number
  total: number
  pages: number
}

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const deciding = ref<string | null>(null)
const declining = ref<PendingApproval | null>(null)
const declineForm = useTemplateRef('declineForm')
const decline = reactive<{ reason?: string }>({})

// Search, filters, sort and page live in the URL (K-129).
const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(rotaApprovalsList)

const empty = (): Listing => ({ items: [], page: 1, pageSize: 0, total: 0, pages: 1 })

const { data: listing, status, refresh } = await useAsyncData(
  'rota-approvals',
  () => request<Listing>('/api/admin/rota/approvals', { query: query.value }),
  { watch: [query], default: empty },
)

function spanOf(startsAt: number): string {
  return saysWhenLong(startsAt)
}

async function approve(row: PendingApproval): Promise<void> {
  failure.value = null
  deciding.value = row.shiftId
  try {
    await $fetch(`/api/admin/rota/approvals/${row.shiftId}/approve`, { method: 'POST' })
    toast.add({
      title: 'Confirmed',
      description: `${row.claimantName} is on the trail for ${saysShiftRole(row.role).toLowerCase()}, ${row.showTitle}.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    deciding.value = null
  }
}

async function submitDecline(event: FormSubmitEvent<{ reason: string }>): Promise<void> {
  const row = declining.value
  if (!row) return
  failure.value = null
  try {
    await $fetch(`/api/admin/rota/approvals/${row.shiftId}/decline`, { method: 'POST', body: event.data })
    toast.add({
      title: 'Declined',
      description: `${row.claimantName} is told why, and the shift stays off the open list until it is reassigned.`,
      icon: 'i-lucide-x',
    })
    declining.value = null
    decline.reason = undefined
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

const columns: TableColumn<PendingApproval>[] = [
  {
    id: 'shift',
    header: 'Shift',
    cell: ({ row }) => h('div', {}, [
      h('p', { class: 'font-medium' }, `${saysShiftRole(row.original.role)}, ${row.original.venueName}`),
      h('p', { class: 'text-sm text-muted' }, `${row.original.showTitle}, ${spanOf(row.original.startsAt)}`),
    ]),
  },
  { accessorKey: 'claimantName', header: 'Claimed by' },
  {
    id: 'act',
    header: ACTIONS_HEADER,
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
      h(UButton, {
        'size': 'sm',
        'variant': 'subtle',
        'color': 'success',
        'loading': deciding.value === row.original.shiftId,
        'data-test': `approve-${row.original.shiftId}`,
        'onClick': () => approve(row.original),
      }, () => 'Confirm'),
      h(UButton, {
        'size': 'sm',
        'color': 'error',
        'variant': 'ghost',
        'data-test': `decline-${row.original.shiftId}`,
        'onClick': () => { declining.value = row.original },
      }, () => 'Decline'),
    ]),
  },
]

// A page alert renders behind an open modal's overlay, where nobody can read it, so a refusal
// is shown wherever the action was taken.
const modalOpen = computed(() => declining.value !== null)

watch(modalOpen, (nowOpen) => {
  if (!nowOpen) failure.value = null
})
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure && !modalOpen"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <p class="text-sm text-muted">
      Shift claims waiting for a decision.
    </p>

    <RotaFlow step="approvals" />

    <AdminToolbar
      v-model:search="search"
      :placeholder="rotaApprovalsList.search?.placeholder"
      :active="active"
      :loading="status === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="rotaApprovalsList"
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
      data-test="approvals-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ filtered ? 'Nothing matches that.' : 'Nothing waiting. Every claim is confirmed or declined already.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="approvals-total"
        class="text-sm text-muted"
      >
        {{ plural(listing.total, 'claim') }} waiting
      </p>
      <UPagination
        v-if="listing.pages > 1"
        v-model:page="page"
        :total="listing.total"
        :items-per-page="listing.pageSize"
      />
    </div>

    <ConfirmModal
      :open="declining !== null"
      name="decline-claim"
      title="Decline this claim"
      verb="Decline the claim"
      consequence="Say why: the claimant sees this word for word, and the shift stays off the open list until an officer reassigns it."
      form="decline-form"
      :failure="failure"
      @update:open="declining = null; failure = null"
    >
      <template #body>
        <UForm
          id="decline-form"
          ref="declineForm"
          :schema="shiftDeclineForm"
          :state="decline"
          class="space-y-4"
          @submit="submitDecline"
        >
          <UFormField
            name="reason"
            label="Reason"
            required
          >
            <UTextarea
              v-model="decline.reason"
              data-test="decline-reason"
              :rows="3"
              autoresize
              :maxrows="6"
              class="w-full"
            />
          </UFormField>
        </UForm>
      </template>
    </ConfirmModal>
  </div>
</template>
