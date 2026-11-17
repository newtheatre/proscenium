<!-- Needs attention (Box office specification, part 5): payments the provider has not answered,
     payments taken that could not be completed and are being returned, and refunds the provider
     turned down, and till sessions that stopped with cash in them and wait to be counted (closed on
     Sessions). An unanswered payment is settled here once someone has checked the provider's own
     records; settling it is final, so it asks first. -->
<script setup lang="ts">
interface Unknown { id: string, intentId: string, method: string, amountMinor: number, currency: string, providerRef: string | null, provider: string, waitingMs: number }
interface Unfulfilled { id: string, amountMinor: number, currency: string, sinceMs: number }
interface Awaiting { id: string, place: string | null, pointLabel: string, openedByName: string, openedAt: number, expectedCashMinor: number, currency: string }
interface FailedRefund { id: string, amountMinor: number, currency: string, method: string, sinceMs: number }

const { t } = useT()
const { $api } = useNuxtApp()
const { money, waited } = await useMoney()
const { confirm } = useConfirm()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ awaitingCount: Awaiting[], unknown: Unknown[], unfulfilled: Unfulfilled[], failedRefunds: FailedRefund[] }>('/api/payments/attention', { key: 'payments:attention' })

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const references = reactive<Record<string, string>>({})
const methodLabel = (method: string) => t(`payments.screens.methods.${method}`)
const nothing = computed(() => !!data.value && !data.value.awaitingCount.length && !data.value.unknown.length && !data.value.unfulfilled.length && !data.value.failedRefunds.length)
const { dateTime: when } = useDates()
const tillName = (s: Awaiting) => [s.place ?? t('payments.screens.session.unknown-place'), s.pointLabel].filter(Boolean).join(' · ')

async function settle(a: Unknown, outcome: 'succeeded' | 'failed') {
  const amount = money(a.amountMinor, a.currency)
  const ok = await confirm({
    verb: t(`payments.screens.attention.${outcome}-verb`),
    thing: t('payments.screens.attention.thing', { amount, provider: a.provider }),
    consequence: t(`payments.screens.attention.${outcome}-consequence`),
    button: t(`payments.screens.attention.${outcome}-button`),
  })
  if (!ok) return
  refusal.value = null
  try {
    await $api(`/api/payments/attempts/${a.id}/reconcile` as string, { method: 'POST', body: { outcome, providerRef: references[a.id]?.trim() || undefined } })
    toast.add({ title: t('payments.screens.attention.settled'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame :title="t('payments.navigation.attention.label')">
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: loaded }">
        <div class="space-y-6">
          <RefusalNotice :refusal="refusal" />
          <EmptyState
            v-if="nothing"
            :title="t('payments.screens.attention.empty')"
            :description="t('payments.screens.attention.empty-help')"
            icon="i-lucide-circle-check"
          />

          <PageSection
            v-if="loaded.unknown.length"
            :title="t('payments.screens.attention.unknown-title')"
            :description="t('payments.screens.attention.unknown-help')"
          >
            <RecordList :label="t('payments.screens.attention.unknown-title')">
              <RecordListItem
                v-for="a in loaded.unknown"
                :key="a.id"
                :name="`${money(a.amountMinor, a.currency)} · ${methodLabel(a.method)} · ${a.provider}`"
                :description="a.providerRef ? `${t('payments.screens.attention.waited', { time: waited(a.waitingMs) })} · ${t('payments.screens.attention.reference', { reference: a.providerRef })}` : t('payments.screens.attention.waited', { time: waited(a.waitingMs) })"
              >
                <template #below>
                  <div class="flex flex-wrap items-end gap-2">
                    <UFormField
                      v-if="!a.providerRef"
                      :label="t('payments.screens.attention.their-reference')"
                      :hint="t('payments.screens.optional')"
                    >
                      <UInput
                        v-model="references[a.id]"
                        maxlength="200"
                        size="sm"
                      />
                    </UFormField>
                    <UButton
                      :label="t('payments.screens.attention.succeeded-button')"
                      icon="i-lucide-check"
                      size="sm"
                      @click="settle(a, 'succeeded')"
                    />
                    <UButton
                      :label="t('payments.screens.attention.failed-button')"
                      icon="i-lucide-x"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      @click="settle(a, 'failed')"
                    />
                  </div>
                </template>
              </RecordListItem>
            </RecordList>
          </PageSection>

          <PageSection
            v-if="loaded.unfulfilled.length"
            :title="t('payments.screens.attention.unfulfilled-title')"
            :description="t('payments.screens.attention.unfulfilled-help')"
          >
            <RecordList :label="t('payments.screens.attention.unfulfilled-title')">
              <RecordListItem
                v-for="i in loaded.unfulfilled"
                :key="i.id"
                :name="money(i.amountMinor, i.currency)"
              >
                <span class="text-sm text-muted">{{ t('payments.screens.attention.since', { time: waited(i.sinceMs) }) }}</span>
              </RecordListItem>
            </RecordList>
          </PageSection>

          <PageSection
            v-if="loaded.awaitingCount.length"
            :title="t('payments.screens.attention.awaiting-count-title')"
            :description="t('payments.screens.attention.awaiting-count-help')"
          >
            <RecordList :label="t('payments.screens.attention.awaiting-count-title')">
              <RecordListItem
                v-for="s in loaded.awaitingCount"
                :key="s.id"
                :name="tillName(s)"
                :description="t('payments.screens.attention.awaiting-count-line', { person: s.openedByName, when: when(s.openedAt), amount: money(s.expectedCashMinor, s.currency) })"
              >
                <UButton
                  :label="t('payments.screens.attention.awaiting-count-open')"
                  to="/console/payments/sessions?view=counting"
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
              </RecordListItem>
            </RecordList>
          </PageSection>

          <PageSection
            v-if="loaded.failedRefunds.length"
            :title="t('payments.screens.attention.failed-refunds-title')"
            :description="t('payments.screens.attention.failed-refunds-help')"
          >
            <RecordList :label="t('payments.screens.attention.failed-refunds-title')">
              <RecordListItem
                v-for="r in loaded.failedRefunds"
                :key="r.id"
                :name="`${money(r.amountMinor, r.currency)} · ${methodLabel(r.method)}`"
              >
                <span class="text-sm text-muted">{{ t('payments.screens.attention.since', { time: waited(r.sinceMs) }) }}</span>
              </RecordListItem>
            </RecordList>
          </PageSection>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
