<!-- The door list for one performance (BO-40): who is coming, found by name or booking reference,
     with how many of their tickets are used. Those still to arrive are the default view. Each row
     opens the order. A buyer with no ticket to scan is admitted from their row, one or all.
     Tickets and membership cards are scanned with the device's camera, one after another, or their
     code typed in the same dialog; the result shows at once there and as a message. The door itself
     is the scanner in live mode, one button away. -->
<script setup lang="ts">
import { doorList } from '../../../../../../shared/lists'

definePageMeta({ layout: 'console' })

interface Row { id: string, reference: string, buyer: string | null, tickets: number, admitted: number }

const { t } = useT()
const route = useRoute()
const id = computed(() => String(route.params.id))

const list = computed(() => ({
  ...doorList,
  filters: { arrived: { ...doorList.filters.arrived, label: t('box-office.door.filter.arrived') } },
  sorts: { reference: { ...doorList.sorts.reference, label: t('box-office.door.column.reference') } },
  columns: Object.fromEntries(Object.entries(doorList.columns).map(([key, c]) => [key, { ...c, label: t(`box-office.door.column.${key}`) }])),
  views: Object.fromEntries(Object.entries(doorList.views).map(([key, v]) => [key, { ...v, label: t(`box-office.door.view.${key}`) }])),
}))
const listRoute = computed(() => `/api/box-office/performances/${encodeURIComponent(id.value)}/door`)
const { $api } = useNuxtApp()
const toast = useToast()
const { toRefusal } = useRefusal()
const admitting = ref<string | null>(null)

interface Scan { result: string, admittedAt?: number, voidReason?: string, card?: { headline: string, line: string, state: 'ok' | 'attention' }, requirement?: { reason: string | null, ticketType: string }, unchecked?: boolean }
const { time } = useDates()
const lastScan = ref<{ text: string, color: 'success' | 'warning' | 'error' } | null>(null)
const COLOUR: Record<string, 'success' | 'warning' | 'error'> = { admitted: 'success', card: 'success', already_admitted: 'warning', not_paid: 'warning', wrong_performance: 'error', void: 'error', unknown: 'error', bad_signature: 'error', card_not_allowed: 'error' }

async function scan(code: string) {
  if (!code.trim()) return
  try {
    const out = await $api<Scan>(`/api/box-office/performances/${encodeURIComponent(id.value)}/scan`, { method: 'POST', body: { code: code.trim() } })
    const said = out.result === 'card' && out.card
      ? `${out.card.headline}. ${out.card.line}`
      : t(`box-office.door.scan.result.${out.result}`, { when: out.admittedAt ? time(out.admittedAt) : '' })
    // The source's own words for why not, and a note when nobody could check.
    const text = [out.requirement?.reason, said, out.unchecked ? t('box-office.door.scan.unchecked') : null].filter(Boolean).join(' ')
    const color = out.result === 'card' && out.card?.state === 'attention' ? 'warning' : COLOUR[out.result] ?? 'error'
    lastScan.value = { text, color }
    toast.add({ title: text, color })
    if (out.result === 'admitted') await refreshNuxtData(`core:list:${listRoute.value}`)
  }
  catch (error) {
    const refusal = toRefusal(error)
    lastScan.value = { text: refusal.reason, color: 'error' }
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
}

async function admit(row: Row, count: number) {
  admitting.value = row.id
  try {
    const { admitted } = await $api<{ admitted: number }>(`${listRoute.value}/admit`, { method: 'POST', body: { orderId: row.id, count } })
    toast.add({ title: t('box-office.door.admitted-now', { count: admitted }), color: admitted ? 'success' : 'neutral' })
    await refreshNuxtData(`core:list:${listRoute.value}`)
  }
  catch (error) {
    const refusal = toRefusal(error)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
  finally {
    admitting.value = null
  }
}

const trail = computed(() => [
  { label: t('box-office.navigation.performances.label'), to: '/console/box-office/performances' },
  { label: t('box-office.door.set-up'), to: `/console/box-office/performances/${encodeURIComponent(id.value)}` },
])
</script>

<template>
  <PageList
    :title="t('box-office.door.title')"
    :trail="trail"
    :route="listRoute"
    :list="list"
    :row-label="(row: Row) => t('box-office.orders.row', { reference: row.reference })"
    :row-to="(row: Row) => `/console/box-office/orders/${encodeURIComponent(row.id)}`"
    :empty="{ title: t('box-office.door.empty.title'), description: t('box-office.door.empty.description'), icon: 'i-lucide-door-open' }"
  >
    <template #primary>
      <UButton
        :to="`/live/door/${encodeURIComponent(id)}`"
        icon="i-lucide-maximize"
        :label="t('box-office.door.open-live')"
      />
      <CodeScanButton
        continuous
        typing
        :label="t('box-office.door.scan.button')"
        :status="lastScan?.text"
        :status-color="lastScan?.color"
        @scanned="scan"
      />
    </template>
    <template #cell-buyer="{ row }">
      {{ row.buyer ?? t('box-office.orders.no-buyer') }}
    </template>
    <template #cell-reference="{ row }">
      <span class="font-mono">{{ row.reference }}</span>
    </template>
    <template #cell-admitted="{ row }">
      <span class="inline-flex flex-wrap items-center gap-2">
        <StatusBadge
          :tone="row.admitted === row.tickets ? 'success' : row.admitted ? 'warning' : 'neutral'"
          :label="t('box-office.door.admitted', { admitted: row.admitted, tickets: row.tickets })"
        />
        <template v-if="row.admitted < row.tickets">
          <UButton
            size="xs"
            variant="outline"
            :loading="admitting === row.id"
            :label="t('box-office.door.admit-one')"
            :aria-label="t('box-office.door.admit-one-of', { reference: row.reference })"
            @click="admit(row, 1)"
          />
          <UButton
            v-if="row.tickets - row.admitted > 1"
            size="xs"
            variant="outline"
            :loading="admitting === row.id"
            :label="t('box-office.door.admit-all', { count: row.tickets - row.admitted })"
            :aria-label="t('box-office.door.admit-all-of', { count: row.tickets - row.admitted, reference: row.reference })"
            @click="admit(row, row.tickets - row.admitted)"
          />
        </template>
      </span>
    </template>
  </PageList>
</template>
