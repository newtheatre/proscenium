<!-- One of my loans (S14, INV-27): its state, dates and lines, read-only; a request can be cancelled. -->
<script setup lang="ts">
import type { LoanDetail, LoanLine } from '../../../../../shared/loans'

const { t } = useT()
const { range } = useDates()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<{ loan: LoanDetail }>(() => `/api/inventory/my/loans/${encodeURIComponent(id.value)}`, { key: `inventory:my-loan:${id.value}` })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const lineName = (l: LoanLine) => l.tag ? `${l.tag} · ${l.name}` : (l.wanted ?? '')

async function cancel() {
  refusal.value = null
  try {
    await $api(`/api/inventory/loans/${id.value}/cancel`, { method: 'POST', body: {} })
    toast.add({ title: t('inventory.borrow.cancelled'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageFrame
        :title="d.loan.department"
        :description="[t(`inventory.loan-states.${d.loan.state}`), range(d.loan.startsAt, d.loan.dueBackOn)].join(' · ')"
        :trail="[{ label: t('inventory.borrow.my-loans'), to: '/members/kit/loans' }]"
        width="reading"
      >
        <template
          v-if="d.loan.can.cancel"
          #primary
        >
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-ban"
            :label="t('inventory.borrow.cancel')"
            @click="cancel"
          />
        </template>
        <div class="space-y-4">
          <RefusalNotice :refusal="refusal" />
          <p
            v-if="d.loan.purpose"
            class="text-sm"
          >
            {{ d.loan.purpose }}
          </p>
          <UAlert
            v-if="d.loan.declineNote"
            color="neutral"
            variant="subtle"
            :title="t('inventory.loan.decline-note')"
            :description="d.loan.declineNote"
          />
          <RecordList :label="t('inventory.loan.lines')">
            <RecordListItem
              v-for="l in d.loan.lineList"
              :key="l.id"
              icon="i-lucide-package"
              :name="lineName(l)"
              :description="t(`inventory.line-states.${l.state}`)"
              :muted="l.state === 'cancelled'"
            />
          </RecordList>
        </div>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
