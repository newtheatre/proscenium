<!-- Needs attention (Box office specification, part 5): payments the provider has not answered,
     payments taken that could not be completed and are being returned, and refunds the provider
     turned down. An unanswered payment is settled here once someone has checked the provider's own
     records; settling it is final, so it asks first. -->
<script setup lang="ts">
interface Unknown { id: string, intentId: string, method: string, amountMinor: number, currency: string, providerRef: string | null, provider: string, waitingMs: number }
interface Unfulfilled { id: string, amountMinor: number, currency: string, sinceMs: number }
interface FailedRefund { id: string, amountMinor: number, currency: string, method: string, sinceMs: number }

const { t } = useT()
const { $api } = useNuxtApp()
const { money, waited } = await useMoney()
const { confirm } = useConfirm()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ unknown: Unknown[], unfulfilled: Unfulfilled[], failedRefunds: FailedRefund[] }>('/api/payments/attention', { key: 'payments:attention' })

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const references = reactive<Record<string, string>>({})
const methodLabel = (method: string) => t(`payments.screens.methods.${method}`)
const nothing = computed(() => !!data.value && !data.value.unknown.length && !data.value.unfulfilled.length && !data.value.failedRefunds.length)

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
            <ul class="divide-y divide-default rounded-lg border border-default">
              <li
                v-for="a in loaded.unknown"
                :key="a.id"
                class="space-y-3 px-3 py-3"
              >
                <div>
                  <p class="font-medium">
                    {{ money(a.amountMinor, a.currency) }} · {{ methodLabel(a.method) }} · {{ a.provider }}
                  </p>
                  <p class="text-sm text-muted">
                    {{ t('payments.screens.attention.waited', { time: waited(a.waitingMs) }) }}<template v-if="a.providerRef">
                      · {{ t('payments.screens.attention.reference', { reference: a.providerRef }) }}
                    </template>
                  </p>
                </div>
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
              </li>
            </ul>
          </PageSection>

          <PageSection
            v-if="loaded.unfulfilled.length"
            :title="t('payments.screens.attention.unfulfilled-title')"
            :description="t('payments.screens.attention.unfulfilled-help')"
          >
            <ul class="divide-y divide-default rounded-lg border border-default">
              <li
                v-for="i in loaded.unfulfilled"
                :key="i.id"
                class="flex flex-wrap items-center gap-3 px-3 py-2"
              >
                <p class="flex-1 font-medium">
                  {{ money(i.amountMinor, i.currency) }}
                </p>
                <p class="text-sm text-muted">
                  {{ t('payments.screens.attention.since', { time: waited(i.sinceMs) }) }}
                </p>
              </li>
            </ul>
          </PageSection>

          <PageSection
            v-if="loaded.failedRefunds.length"
            :title="t('payments.screens.attention.failed-refunds-title')"
            :description="t('payments.screens.attention.failed-refunds-help')"
          >
            <ul class="divide-y divide-default rounded-lg border border-default">
              <li
                v-for="r in loaded.failedRefunds"
                :key="r.id"
                class="flex flex-wrap items-center gap-3 px-3 py-2"
              >
                <p class="flex-1 font-medium">
                  {{ money(r.amountMinor, r.currency) }} · {{ methodLabel(r.method) }}
                </p>
                <p class="text-sm text-muted">
                  {{ t('payments.screens.attention.since', { time: waited(r.sinceMs) }) }}
                </p>
              </li>
            </ul>
          </PageSection>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
