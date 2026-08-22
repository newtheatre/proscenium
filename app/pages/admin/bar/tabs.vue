<!--
Admin: who owes for a tab. Settling takes the balance on the reader and
records it as an ordinary card sale that day (ADR-0030).
-->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  title: 'Bar tabs',
})

interface DebtorRow {
  userId: string
  name: string
  email: string
  anonymisedAt: string | null
  chargeCount: number
  outstandingPence: number
  oldestChargeOn: string
  overSoftCap: boolean
}

interface ChargeItem { name: string, qty: number, unitPricePence: number }
interface Charge { id: string, takenAt: string, totalPence: number, source: string, items: ChargeItem[] }
interface PersonTab {
  person: { id: string, name: string, email: string }
  outstanding: Charge[]
  outstandingPence: number
}

const toast = useToast()

function statusMessage(error: unknown): string | undefined {
  return (error as { data?: { statusMessage?: string } }).data?.statusMessage
}

const requestFetch = useRequestFetch()
const limit = 25
const page = ref(1)
const { data, status, error, refresh } = await useAsyncData('admin-bar-tabs', () =>
  requestFetch<Paginated<DebtorRow>>('/api/admin/bar/tabs', { query: { page: page.value, limit } }), {
  default: () => ({ rows: [], total: 0, page: 1, limit }),
  watch: [page],
})

const rows = computed<DebtorRow[]>(() => data.value?.rows ?? [])
const totalOutstanding = computed(() => rows.value.reduce((t, r) => t + r.outstandingPence, 0))
const overCapCount = computed(() => rows.value.filter(r => r.overSoftCap).length)

const columns: TableColumn<DebtorRow>[] = [
  { accessorKey: 'name', header: 'Person' },
  { accessorKey: 'chargeCount', header: 'Charges' },
  { accessorKey: 'oldestChargeOn', header: 'Oldest' },
  { accessorKey: 'outstandingPence', header: 'Outstanding' },
  { id: 'actions', header: '' },
]

// One person's tab, opened to settle or to void a charge.
const open = ref(false)
const busy = ref(false)
const detail = ref<PersonTab | null>(null)

async function openTab(userId: string) {
  detail.value = null
  open.value = true
  try {
    detail.value = await requestFetch<PersonTab>(`/api/admin/bar/tabs/${userId}`)
  }
  catch (err) {
    open.value = false
    toast.add({ title: 'Could not open that tab', description: statusMessage(err), color: 'error' })
  }
}

async function settle() {
  if (!detail.value) return
  busy.value = true
  try {
    const result = await requestFetch<{ totalPence: number }>('/api/admin/bar/tabs/settle', {
      method: 'POST',
      body: {
        debtorUserId: detail.value.person.id,
        expectedTotalPence: detail.value.outstandingPence,
      },
    })
    open.value = false
    toast.add({ title: `Settled ${formatMoney(result.totalPence)}`, color: 'success' })
    await refresh()
  }
  catch (err) {
    toast.add({ title: 'Not settled', description: statusMessage(err), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

async function voidCharge(id: string) {
  if (!detail.value) return
  busy.value = true
  try {
    await requestFetch(`/api/bar/tabs/${id}/void`, {
      method: 'POST',
      body: { reason: 'Written off by the bar manager' },
    })
    toast.add({ title: 'Charge voided', color: 'success' })
    await Promise.all([openTab(detail.value.person.id), refresh()])
  }
  catch (err) {
    toast.add({ title: 'Not voided', description: statusMessage(err), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <AdminPage>
    <AdminTableToolbar>
      <template #left>
        <p class="text-sm text-muted">
          Snacks and drinks put on a tab and not yet paid for. Settle a tab by taking
          the balance on the reader; it lands in that day's SumUp total.
        </p>
      </template>
    </AdminTableToolbar>

    <div class="grid gap-4 sm:grid-cols-3">
      <UCard>
        <p class="text-sm text-muted">
          Outstanding on this page
        </p>
        <p class="text-2xl font-bold tabular-nums">
          {{ formatMoney(totalOutstanding) }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          People with a tab
        </p>
        <p class="text-2xl font-bold tabular-nums">
          {{ data?.total ?? 0 }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          Over the tab limit
        </p>
        <p class="text-2xl font-bold tabular-nums">
          {{ overCapCount }}
        </p>
      </UCard>
    </div>

    <AdminFetchError
      :error="error"
      :on-retry="refresh"
    />

    <UTable
      :data="rows"
      :columns="columns"
      :loading="status === 'pending'"
    >
      <template #name-cell="{ row }">
        <div>
          <p class="font-medium">
            {{ row.original.name }}
          </p>
          <p class="text-xs text-muted">
            {{ row.original.email }}
          </p>
        </div>
      </template>
      <template #outstandingPence-cell="{ row }">
        <div class="flex items-center gap-2">
          <span class="tabular-nums">{{ formatMoney(row.original.outstandingPence) }}</span>
          <UBadge
            v-if="row.original.overSoftCap"
            color="warning"
            variant="subtle"
            label="Over limit"
          />
        </div>
      </template>
      <template #oldestChargeOn-cell="{ row }">
        <span class="text-sm text-muted">{{ formatDate(row.original.oldestChargeOn) }}</span>
      </template>
      <template #actions-cell="{ row }">
        <UButton
          size="xs"
          variant="soft"
          label="Open"
          @click="openTab(row.original.userId)"
        />
      </template>
      <template #empty>
        <UEmpty
          icon="i-lucide-notebook-pen"
          title="Nobody owes anything"
          description="Tabs appear here as soon as someone puts a snack on one."
        />
      </template>
    </UTable>

    <AdminTablePagination
      v-model:page="page"
      :total="data?.total ?? 0"
      :limit="limit"
      label="tab"
    />

    <UModal
      v-model:open="open"
      :title="detail ? `${detail.person.name}'s tab` : 'Tab'"
    >
      <template #body>
        <div
          v-if="detail"
          class="space-y-4"
        >
          <p class="text-sm text-muted">
            {{ detail.person.email }}
          </p>
          <ul class="divide-y divide-default">
            <li
              v-for="charge in detail.outstanding"
              :key="charge.id"
              class="flex items-start justify-between gap-3 py-2"
            >
              <div class="min-w-0">
                <p class="truncate text-sm">
                  {{ charge.items.map(i => `${i.qty} x ${i.name}`).join(', ') || 'Bar items' }}
                </p>
                <p class="text-xs text-muted">
                  {{ formatDateTime(charge.takenAt) }}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <span class="tabular-nums">{{ formatMoney(charge.totalPence) }}</span>
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-trash-2"
                  :disabled="busy"
                  aria-label="Void this charge"
                  @click="voidCharge(charge.id)"
                />
              </div>
            </li>
          </ul>
          <p class="text-right font-mono text-2xl font-bold">
            {{ formatMoney(detail.outstandingPence) }}
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Close"
            @click="open = false"
          />
          <UButton
            :loading="busy"
            :disabled="busy || !detail || detail.outstandingPence <= 0"
            :label="detail ? `Take ${formatMoney(detail.outstandingPence)} on the reader` : 'Settle'"
            @click="settle"
          />
        </div>
      </template>
    </UModal>
  </AdminPage>
</template>
