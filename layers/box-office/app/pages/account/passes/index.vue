<!-- My passes (BO-64; mock-up approved by Matt 2026-11-18): each pass on the person's account, with
     the code that books with it, what is still to pay, what is booked and the shows it can still
     book. A pass makes reservations; the ticket for the night is what the door scans. -->
<script setup lang="ts">
interface Entry { orderId: string, reference: string, show: string, startsAt: number, confirmed: boolean }
interface MyPass { id: string, name: string, priceName: string, code: string | null, owedMinor: number, currency: string, left: number | null, state: 'active' | 'void', entries: Entry[], open: { productionId: string, title: string, slug: string }[] }

const { t } = useT()
const { money } = await useMoney()
const { dateTime } = useDates()
const { data, status, error, refresh } = await useAPI<{ passes: MyPass[] }>('/api/box-office/passes/mine', { key: 'box-office:my-passes' })
</script>

<template>
  <PageFrame
    :title="t('box-office.navigation.my-passes.label')"
    :description="t('box-office.my-passes.help')"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.passes.length"
        :title="t('box-office.my-passes.empty')"
        :description="t('box-office.my-passes.empty-description')"
        icon="i-lucide-id-card"
      />
      <div
        v-else
        class="space-y-6"
      >
        <UCard
          v-for="pass in data.passes"
          :key="pass.id"
          :ui="{ body: 'space-y-4' }"
        >
          <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div class="min-w-0">
              <h2 class="text-lg font-medium">
                {{ pass.name }}
              </h2>
              <p class="text-sm text-muted">
                {{ [pass.priceName, pass.left !== null ? t('box-office.my-passes.left', { count: pass.left }) : null].filter(Boolean).join(' · ') }}
              </p>
            </div>
            <UBadge
              v-if="pass.state === 'void'"
              color="neutral"
              variant="subtle"
              :label="t('box-office.my-passes.cancelled')"
            />
            <UBadge
              v-else-if="pass.owedMinor"
              color="warning"
              variant="subtle"
              icon="i-lucide-hand-coins"
              :label="t('box-office.my-passes.owed', { amount: money(pass.owedMinor, pass.currency) })"
            />
          </div>
          <div
            v-if="pass.code && pass.state === 'active'"
            class="rounded-md bg-elevated/50 p-3"
          >
            <p class="text-sm text-muted">
              {{ t('box-office.my-passes.code') }}
            </p>
            <p class="font-mono text-lg font-medium tracking-wide">
              {{ pass.code }}
            </p>
            <p class="text-sm text-muted">
              {{ t('box-office.my-passes.code-help') }}
            </p>
          </div>
          <UAlert
            v-if="pass.owedMinor && pass.state === 'active'"
            color="warning"
            variant="subtle"
            icon="i-lucide-hand-coins"
            :title="t('box-office.my-passes.pay-title')"
            :description="t('box-office.my-passes.pay-help', { amount: money(pass.owedMinor, pass.currency) })"
          />
          <BoxOfficePassCoverPanel
            v-if="pass.state === 'active'"
            :pass-id="pass.id"
            :currency="pass.currency"
            mode="mine"
            @covered="refresh()"
          />
          <RecordList
            v-if="pass.entries.length || pass.open.length"
            :label="t('box-office.my-passes.shows', { name: pass.name })"
          >
            <RecordListItem
              v-for="e in pass.entries"
              :key="`${e.orderId}:${e.startsAt}`"
              to="/account/tickets"
              :name="e.show"
              :description="t(e.confirmed ? 'box-office.my-passes.booked' : 'box-office.my-passes.reserved', { when: dateTime(e.startsAt) })"
            />
            <RecordListItem
              v-for="o in pass.state === 'active' ? pass.open : []"
              :key="o.productionId"
              :name="o.title"
              :description="t('box-office.my-passes.not-booked')"
            >
              <UButton
                :to="`/whats-on/${o.slug}`"
                variant="soft"
                :label="t('box-office.my-passes.book')"
              />
            </RecordListItem>
          </RecordList>
        </UCard>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
