<!-- The Box office tab on a person's console page: the passes they hold, each with its code where the
     viewer hands codes over, and their bookings, newest first, each opening its own page. -->
<script setup lang="ts">
import type { OrderState } from '../utils/orderState'

interface Pass { id: string, passTypeId: string, name: string, priceName: string, code: string | null, state: 'active' | 'void', paid: boolean, entries: number }
interface Order { id: string, reference: string, state: OrderState, currency: string, totalMinor: number, createdAt: number, show: string | null, startsAt: number | null }

const props = defineProps<{ recordId: string }>()
const { t } = useT()
const { dateTime } = useDates()
const { money } = await useMoney()
const { data, status, error, refresh } = await useAPI<{ orders: Order[], passes: Pass[] }>(() => `/api/box-office/accounts/${encodeURIComponent(props.recordId)}`, { key: `box-office:account:${props.recordId}` })

const passDetail = (p: Pass) => [
  p.priceName,
  p.code ? t('box-office.account-tab.code', { code: p.code }) : null,
  p.state === 'void' ? t('box-office.account-tab.pass-void') : p.paid ? null : t('box-office.account-tab.pass-unpaid'),
  t('box-office.account-tab.entries', { count: p.entries }),
].filter(Boolean).join(' · ')
const orderDetail = (o: Order) => [o.show && o.startsAt ? `${o.show}, ${dateTime(o.startsAt)}` : o.show, money(o.totalMinor, o.currency)].filter(Boolean).join(' · ')
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <div class="space-y-6">
        <PageSection
          v-if="d.passes.length"
          :title="t('box-office.account-tab.passes')"
        >
          <RecordList
            :label="t('box-office.account-tab.passes')"
            flush
          >
            <RecordListItem
              v-for="p in d.passes"
              :key="p.id"
              :to="`/console/box-office/passes?holders=${encodeURIComponent(p.passTypeId)}`"
              icon="i-lucide-ticket"
              :name="p.name"
              :description="passDetail(p)"
              :muted="p.state === 'void'"
            />
          </RecordList>
        </PageSection>
        <PageSection :title="t('box-office.account-tab.orders')">
          <EmptyState
            v-if="!d.orders.length"
            :title="t('box-office.account-tab.no-orders')"
          />
          <RecordList
            v-else
            :label="t('box-office.account-tab.orders')"
            flush
          >
            <RecordListItem
              v-for="o in d.orders"
              :key="o.id"
              :to="`/console/box-office/orders/${encodeURIComponent(o.id)}`"
              :name="o.reference"
              :description="orderDetail(o)"
              :muted="o.state === 'cancelled' || o.state === 'expired'"
            >
              <StatusBadge
                :tone="orderStateBadge(o, t).tone"
                :label="orderStateBadge(o, t).label"
              />
            </RecordListItem>
          </RecordList>
        </PageSection>
      </div>
    </template>
  </DataBoundary>
</template>
