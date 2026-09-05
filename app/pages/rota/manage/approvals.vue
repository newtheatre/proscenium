<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { formatLondon } from '#shared/utils/london'
import { saysShiftRole, shiftDeclineForm } from '#shared/utils/rota'
import type { ShiftRole } from '#shared/utils/rota'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Approvals', middleware: 'console' })

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

const toast = useToast()
const page = ref(1)
const search = ref('')
const failure = ref<string | null>(null)
const deciding = ref<string | null>(null)
const declining = ref<PendingApproval | null>(null)
const declineForm = useTemplateRef('declineForm')
const decline = reactive<{ reason?: string }>({})

const { data: listing, status, refresh } = await useFetch<Listing>('/api/admin/rota/approvals', {
  query: computed(() => ({ page: page.value })),
  watch: [page],
  default: (): Listing => ({ items: [], page: 1, pageSize: 25, total: 0, pages: 1 }),
})

const shown = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return listing.value.items
  return listing.value.items.filter(row =>
    row.claimantName.toLowerCase().includes(term) || row.showTitle.toLowerCase().includes(term))
})

function spanOf(startsAt: number): string {
  return formatLondon(new Date(startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
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
    header: '',
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
      icon="i-lucide-check-check"
      title="Claims wait here while auto-confirm is off"
      description="A confirmed claim becomes tonight's shift. A decline needs a reason, because that is what the claimant is shown."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A name or a show"
      :filterable="false"
      :loading="status === 'pending'"
      @clear="search = ''"
    />

    <UTable
      :data="shown"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="approvals-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          Nothing waiting. Every claim is confirmed or declined already.
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

    <UModal
      :open="declining !== null"
      title="Decline this claim"
      description="Say why: the claimant sees this word for word, and the shift stays off the open list until an officer reassigns it."
      @update:open="declining = null"
    >
      <template #body>
        <UForm
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
          <UButton
            type="submit"
            color="error"
            data-test="decline-submit"
          >
            Decline
          </UButton>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
