<!-- My session (Box office specification, part 5): open a till session with a float, see the cash
     expected in it, and cash up: counting stops new payments and closing compares the cash counted.
     A payment still waiting for an answer stops the count; each is named with the time it turns
     unknown, after which it is settled on Needs attention. A hand-off to the SumUp app returns here.
     Where no cash is taken a session has no float and closes in one step, with nothing to count. -->
<script setup lang="ts">
interface Session { handlesCash: boolean, id: string, pointLabel: string, openedAt: number, state: 'open' | 'counting' | 'closed', floatMinor: number, expectedCashMinor: number, currency: string }
interface Waiting { id: string, method: string, amountMinor: number, currency: string, state: string, provider: string, startedAt: number, unknownAt: number | null }

const { t } = useT()
const { $api } = useNuxtApp()
const route = useRoute()
const { money } = await useMoney()
const { dateTime: when, time } = useDates()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ cashTaken: boolean, session: Session | null, waiting: Waiting[] }>('/api/payments/session', { key: 'payments:session' })

// The SumUp app sends the seller back here with what it says happened.
const handoff = computed(() => {
  const result = route.query.result
  if (!route.query.attempt || typeof result !== 'string') return null
  return result === 'succeeded' ? 'succeeded' : result === 'failed' ? 'failed' : 'unknown'
})

const opening = reactive({ pointLabel: '', floatMinor: null as number | null, key: crypto.randomUUID() })
const busy = ref(false)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function open() {
  busy.value = true
  refusal.value = null
  try {
    const floatMinor = data.value?.cashTaken ? opening.floatMinor ?? undefined : undefined
    await $api('/api/payments/sessions', { method: 'POST', body: { pointLabel: opening.pointLabel, floatMinor }, headers: { 'idempotency-key': opening.key } })
    opening.key = crypto.randomUUID()
    toast.add({ title: t('payments.screens.session.opened'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}

async function count() {
  if (!data.value?.session) return
  busy.value = true
  refusal.value = null
  try {
    await $api(`/api/payments/sessions/${data.value.session.id}/count` as string, { method: 'POST', body: {} })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    await refresh()
  }
  finally {
    busy.value = false
  }
}

// Without cash there is nothing to count, so counting and closing are one step: the count fixes no
// cash expected, and the close records none counted. A close refused after the count leaves the session
// being counted, where the close form offers the close again.
async function closeWithoutCash() {
  const session = data.value?.session
  if (!session) return
  busy.value = true
  refusal.value = null
  try {
    await $api(`/api/payments/sessions/${session.id}/count` as string, { method: 'POST', body: {} })
    await $api(`/api/payments/sessions/${session.id}/close` as string, { method: 'POST', body: { countedMinor: 0 } })
    toast.add({ title: t('payments.screens.close.done'), color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
    await refresh()
  }
}

const facts = (s: Session) => [
  { label: t('payments.screens.session.opened-at'), value: when(s.openedAt), strong: false },
  ...(s.handlesCash
    ? [
        { label: t('payments.screens.session.float'), value: money(s.floatMinor, s.currency), strong: false },
        { label: t('payments.screens.session.expected'), value: money(s.expectedCashMinor, s.currency) },
      ]
    : []),
]

const methodLabel = (method: string) => t(`payments.screens.methods.${method}`)
</script>

<template>
  <PageFrame
    :title="t('payments.navigation.session.label')"
    width="reading"
  >
    <UAlert
      v-if="handoff"
      class="mb-4"
      :color="handoff === 'succeeded' ? 'success' : handoff === 'failed' ? 'error' : 'warning'"
      :icon="handoff === 'succeeded' ? 'i-lucide-circle-check' : 'i-lucide-triangle-alert'"
      :title="t(`payments.screens.session.handoff.${handoff}`)"
      :description="t(`payments.screens.session.handoff.${handoff}-help`)"
    />
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      :skeleton-rows="3"
      @retry="refresh()"
    >
      <template #default="{ data: loaded }">
        <!-- No session: open one. -->
        <PageSection
          v-if="!loaded.session"
          :title="t('payments.screens.session.open-title')"
          :description="t(loaded.cashTaken ? 'payments.screens.session.open-help' : 'payments.screens.session.open-help-no-cash')"
        >
          <UForm
            class="space-y-4"
            :state="opening"
            @submit="open"
          >
            <RefusalNotice :refusal="refusal" />
            <UFormField
              :label="t('payments.screens.session.point')"
              :help="t('payments.screens.session.point-help')"
              required
              :error="refusal?.fields?.pointLabel ? refusal.reason : undefined"
            >
              <UInput
                v-model="opening.pointLabel"
                maxlength="60"
              />
            </UFormField>
            <UFormField
              v-if="loaded.cashTaken"
              :label="t('payments.screens.session.float')"
              :hint="t('payments.screens.optional')"
              :help="t('payments.screens.session.float-help')"
              :error="refusal?.fields?.floatMinor ? refusal.reason : undefined"
            >
              <FieldMoney
                v-model="opening.floatMinor"
                class="sm:w-56"
              />
            </UFormField>
            <UButton
              type="submit"
              :loading="busy"
              :disabled="!opening.pointLabel.trim()"
              :label="t('payments.screens.session.open-button')"
            />
          </UForm>
        </PageSection>

        <div
          v-else
          class="space-y-6"
        >
          <PageSection :title="loaded.session.pointLabel">
            <template #actions>
              <StatusBadge
                :tone="loaded.session.state === 'open' ? 'success' : 'warning'"
                :label="t(`payments.screens.session.states.${loaded.session.state}`)"
              />
            </template>
            <FactStrip :facts="facts(loaded.session)" />
          </PageSection>

          <PageSection
            v-if="loaded.waiting.length"
            :title="t('payments.screens.session.waiting-title')"
            :description="t('payments.screens.session.waiting-help')"
          >
            <RecordList :label="t('payments.screens.session.waiting-title')">
              <RecordListItem
                v-for="w in loaded.waiting"
                :key="w.id"
                :name="`${money(w.amountMinor, w.currency)} · ${methodLabel(w.method)} · ${w.provider}`"
                :description="w.unknownAt ? t('payments.screens.session.unknown-at', { started: time(w.startedAt), at: time(w.unknownAt) }) : t('payments.screens.session.unknown-now', { started: time(w.startedAt) })"
              >
                <UButton
                  v-if="!w.unknownAt"
                  :label="t('payments.navigation.attention.label')"
                  to="/console/payments/attention"
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
              </RecordListItem>
            </RecordList>
          </PageSection>

          <PageSection
            v-if="loaded.session.state === 'open' && !loaded.session.handlesCash"
            :title="t('payments.screens.close.button')"
            :description="t('payments.screens.session.close-help-no-cash')"
          >
            <div class="space-y-4">
              <RefusalNotice :refusal="refusal" />
              <UButton
                :loading="busy"
                :disabled="loaded.waiting.length > 0"
                :label="t('payments.screens.close.button')"
                icon="i-lucide-lock"
                @click="closeWithoutCash"
              />
            </div>
          </PageSection>

          <PageSection
            v-else-if="loaded.session.state === 'open'"
            :title="t('payments.screens.session.cash-up-title')"
            :description="t('payments.screens.session.cash-up-help')"
          >
            <div class="space-y-4">
              <RefusalNotice :refusal="refusal" />
              <UButton
                :loading="busy"
                :disabled="loaded.waiting.length > 0"
                :label="t('payments.screens.session.cash-up-button')"
                icon="i-lucide-calculator"
                @click="count"
              />
            </div>
          </PageSection>

          <PageSection
            v-else
            :title="t(loaded.session.handlesCash ? 'payments.screens.close.title' : 'payments.screens.close.button')"
          >
            <PaymentsCloseSession
              :session="loaded.session"
              @closed="refresh()"
            />
          </PageSection>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
