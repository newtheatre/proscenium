<!-- Openings (S5): each outlet trades from its first sale until someone closes it. Closing voids the
     sales left unpaid, and waits while a payment is still being taken. -->
<script setup lang="ts">
interface Opening { id: string, outlet: string, operatingDay: string, state: 'open' | 'closed', openedAt: number, closedAt: number | null, paidMinor: number, sales: number, waiting: number, unpaid: number }

const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { day, time } = useDates()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ openings: Opening[] }>('/api/bar/openings', { key: 'bar:openings' })

const describe = (o: Opening) => [
  t('bar.screens.openings.takings', { amount: money(o.paidMinor), count: o.sales }),
  o.state === 'open' ? t('bar.screens.openings.since', { time: time(o.openedAt) }) : t('bar.screens.openings.closed-at', { time: time(o.closedAt!) }),
].join(' · ')

async function close(o: Opening) {
  const ok = await confirm({
    verb: t('bar.screens.openings.close'),
    thing: o.outlet,
    consequence: o.unpaid ? t('bar.screens.openings.close-voids', { count: o.unpaid }) : t('bar.screens.openings.close-plain'),
    button: t('bar.screens.openings.close-title', { outlet: o.outlet }),
  })
  if (!ok) return
  try {
    await $api(`/api/bar/openings/${o.id}/close` as string, { method: 'POST', body: {} })
    toast.add({ title: t('bar.screens.openings.closed', { outlet: o.outlet }), color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, description: toRefusal(e).remedy, color: 'error' })
  }
}
</script>

<template>
  <PageFrame :title="t('bar.navigation.openings.label')">
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template v-if="data">
        <EmptyState
          v-if="!data.openings.length"
          icon="i-lucide-clock"
          :title="t('bar.screens.openings.empty-title')"
          :description="t('bar.screens.openings.empty')"
        />
        <RecordList
          v-else
          :label="t('bar.navigation.openings.label')"
        >
          <RecordListItem
            v-for="o in data.openings"
            :key="o.id"
            :name="t('bar.screens.openings.name', { outlet: o.outlet, day: day(o.operatingDay) })"
            :description="describe(o)"
            :muted="o.state === 'closed'"
          >
            <StatusBadge
              :tone="o.state === 'open' ? 'success' : 'neutral'"
              :label="t(`bar.screens.openings.states.${o.state}`)"
            />
            <UButton
              v-if="o.state === 'open'"
              color="neutral"
              variant="outline"
              size="sm"
              :label="t('bar.screens.openings.close-title', { outlet: o.outlet })"
              :disabled="o.waiting > 0"
              @click="close(o)"
            />
          </RecordListItem>
        </RecordList>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
