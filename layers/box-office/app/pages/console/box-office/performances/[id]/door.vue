<!-- The door list for one performance (BO-40): who is coming, found by name or booking reference,
     with how many of their tickets are used. Those still to arrive are the default view. Each row
     opens the order. A buyer with no ticket to scan is admitted from their row, one or all. A sale at
     the desk with no name given reads "Desk sale, 3 tickets, 19:02" (D9). Scanning is the door itself,
     in live mode, one button away; this page has no second scanner (D9, box office review). -->
<script setup lang="ts">
import { doorList } from '../../../../../../shared/lists'

definePageMeta({ layout: 'console' })

interface Row { id: string, reference: string, buyer: string | null, channel?: string, at?: number, tickets: number, admitted: number, unpaid?: { amountDueMinor: number, currency: string }, released?: true }

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

const { money } = await useMoney()
const nameOf = useDoorName()

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

// Release unpaid no-shows (Matt, 2026-11-18): every reservation still unpaid, and not marked to
// keep, lets its seats go now. Undo seats them again, where the seats are still free.
const { confirm } = useConfirm()
const { offer } = useUndo()
const releasing = ref(false)
async function releaseUnpaid() {
  if (!await confirm({ verb: t('box-office.door.release.verb'), thing: t('box-office.door.release.thing'), consequence: t('box-office.door.release.consequence'), button: t('box-office.door.release.button') })) return
  releasing.value = true
  try {
    const { released } = await $api<{ released: string[] }>(`${listRoute.value}/release-unpaid`, { method: 'POST', body: {} })
    await refreshNuxtData(`core:list:${listRoute.value}`)
    if (!released.length) {
      toast.add({ title: t('box-office.door.release.none'), color: 'neutral' })
      return
    }
    offer(t('box-office.door.release.done', { count: released.length }), async () => {
      for (const orderId of released) await $api(`/api/box-office/orders/${encodeURIComponent(orderId)}/reinstate`, { method: 'POST', body: {} })
      await refreshNuxtData(`core:list:${listRoute.value}`)
    })
  }
  catch (error) {
    const refusal = toRefusal(error)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
  finally {
    releasing.value = false
  }
}

const more = computed(() => [[
  { label: t('box-office.live-door.print'), icon: 'i-lucide-printer', to: `/live/door/${encodeURIComponent(id.value)}/print` },
  { label: t('box-office.door.release.button'), icon: 'i-lucide-clock-alert', onSelect: () => { void releaseUnpaid() } },
]])
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
      <UButton
        :to="`/live/door/${encodeURIComponent(id)}/print`"
        icon="i-lucide-printer"
        color="neutral"
        variant="outline"
        class="max-sm:hidden"
        :label="t('box-office.live-door.print')"
      />
      <UButton
        icon="i-lucide-clock-alert"
        color="neutral"
        variant="outline"
        class="max-sm:hidden"
        :loading="releasing"
        :label="t('box-office.door.release.button')"
        @click="releaseUnpaid"
      />
      <!-- Three worded buttons do not fit a phone's bar: the two lesser ones fold into a menu there. -->
      <RowActions
        class="sm:hidden"
        size="md"
        variant="outline"
        :items="more"
        :label="t('box-office.door.more')"
      />
    </template>
    <template #cell-buyer="{ row }">
      {{ nameOf(row) }}
    </template>
    <template #cell-reference="{ row }">
      <span class="font-mono">{{ row.reference }}</span>
    </template>
    <template #cell-admitted="{ row }">
      <!-- A reservation not yet paid for: nobody on it can be admitted until the till takes payment. -->
      <span
        v-if="row.unpaid"
        class="inline-flex flex-wrap items-center gap-2"
      >
        <StatusBadge
          :tone="row.released ? 'warning' : 'info'"
          :label="row.released ? t('box-office.door.released') : t('box-office.live-door.result.not_paid')"
        />
        <span class="text-muted">{{ money(row.unpaid.amountDueMinor, row.unpaid.currency) }}</span>
      </span>
      <span
        v-else
        class="inline-flex flex-wrap items-center gap-2"
      >
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
