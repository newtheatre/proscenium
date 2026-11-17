<!-- Providers and readers (Box office specification, part 5; PAY-01, PAY-02): the payment providers
     this site can use, each saying which secret it still needs; the accounts set up with them; the
     card readers paired with each; a test payment on an account in test mode; and payouts entered by
     hand from the provider's statement. Secrets are set on the Worker, never typed here. -->
<script setup lang="ts">
interface Provider { id: string, capabilities: string[], methods: { method: string, channels: string[] }[], pairsReaders: boolean, missingSecrets: string[] }
interface Account { id: string, provider: string, label: string, channels: string[], mode: 'live' | 'test', externalRef: string | null, active: boolean }
type Next = { kind: 'redirect' | 'handoff', url: string } | { kind: 'client-secret', secret: string } | { kind: 'waiting-for-reader' } | { kind: 'none' }

const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ providers: Provider[], accounts: Account[] }>('/api/payments/providers', { key: 'payments:providers' })

const providerName = (id: string) => t(`payments.screens.providers.names.${id}`)
const providerOf = (a: Account) => data.value?.providers.find(p => p.id === a.provider)
const webhookAddress = (a: Account) => (import.meta.client ? `${window.location.origin}/api/payments/webhooks/${a.id}` : `/api/payments/webhooks/${a.id}`)

// Adding an account.
const adding = ref(false)
const form = reactive({ provider: '', label: '', channels: [] as string[], mode: 'live' as 'live' | 'test', externalRef: '', key: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
const chosen = computed(() => data.value?.providers.find(p => p.id === form.provider))
const channelsOf = (p: Provider | undefined) => [...new Set(p?.methods.flatMap(m => m.channels) ?? [])]
watch(() => form.provider, () => {
  form.channels = channelsOf(chosen.value)
  if (!chosen.value?.capabilities.includes('test-mode')) form.mode = 'live'
})
function openAdd() {
  Object.assign(form, { provider: '', label: '', channels: [], mode: 'live', externalRef: '', key: crypto.randomUUID() })
  refusal.value = null
  adding.value = true
}
async function add() {
  busy.value = true
  refusal.value = null
  try {
    await $api('/api/payments/providers', { method: 'POST', body: { provider: form.provider, label: form.label, channels: form.channels, mode: form.mode, externalRef: form.externalRef.trim() || undefined }, headers: { 'idempotency-key': form.key } })
    adding.value = false
    toast.add({ title: t('payments.screens.providers.added'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}

// A test payment on a test-mode account.
const readers = reactive<Record<string, { id: string, label: string }[]>>({})
const testing = reactive<Record<string, { busy: boolean, intentId?: string, next?: Next, state?: string, readerId?: string, refusal?: ReturnType<typeof toRefusal> }>>({})
async function testPayment(a: Account) {
  const p = providerOf(a)
  const method = p?.methods.some(m => m.method === 'card_reader') ? 'card_reader' : 'card_online'
  const run = testing[a.id] ?? (testing[a.id] = { busy: false })
  run.busy = true
  run.refusal = undefined
  try {
    const result = await $api<{ intentId: string, next: Next, state: string }>(`/api/payments/providers/${a.id}/test-payment` as string, { method: 'POST', body: { method, readerId: method === 'card_reader' ? run.readerId : undefined }, headers: { 'idempotency-key': crypto.randomUUID() } })
    Object.assign(run, { intentId: result.intentId, next: result.next, state: result.state })
  }
  catch (e) {
    run.refusal = toRefusal(e)
  }
  finally {
    run.busy = false
  }
}
async function checkTest(a: Account) {
  const run = testing[a.id]
  if (!run?.intentId) return
  try {
    const status = await $api<{ state: string, paidMinor: number, waiting: boolean }>(`/api/payments/intents/${run.intentId}` as string)
    run.state = status.waiting ? 'pending' : status.paidMinor > 0 ? 'succeeded' : status.state
  }
  catch (e) {
    run.refusal = toRefusal(e)
  }
}

// A payout entered by hand.
const paying = ref(false)
const payout = reactive({ providerAccountId: '', paidMinor: null as number | null, feesMinor: 0 as number | null, paidOn: '', reference: '', key: '' })
const payoutRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
function openPayout() {
  Object.assign(payout, { providerAccountId: data.value?.accounts.find(a => a.active && a.mode === 'live')?.id ?? '', paidMinor: null, feesMinor: 0, paidOn: '', reference: '', key: crypto.randomUUID() })
  payoutRefusal.value = null
  paying.value = true
}
async function recordPayout() {
  busy.value = true
  payoutRefusal.value = null
  try {
    await $api('/api/payments/payouts', { method: 'POST', body: { providerAccountId: payout.providerAccountId, paidMinor: payout.paidMinor ?? 0, feesMinor: payout.feesMinor ?? 0, paidOn: payout.paidOn, reference: payout.reference }, headers: { 'idempotency-key': payout.key } })
    paying.value = false
    toast.add({ title: t('payments.screens.payouts.recorded', { amount: money(payout.paidMinor ?? 0) }), color: 'success' })
  }
  catch (e) {
    payoutRefusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <PageFrame :title="t('payments.navigation.providers.label')">
    <template #primary>
      <UButton
        :label="t('payments.screens.providers.add')"
        icon="i-lucide-plus"
        @click="openAdd"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: loaded }">
        <div class="space-y-6">
          <PageSection
            :title="t('payments.screens.providers.accounts-title')"
            :description="t('payments.screens.providers.accounts-help')"
          >
            <template #actions>
              <UButton
                v-if="loaded.accounts.length"
                :label="t('payments.screens.payouts.record')"
                icon="i-lucide-landmark"
                color="neutral"
                variant="outline"
                size="sm"
                @click="openPayout"
              />
            </template>
            <EmptyState
              v-if="!loaded.accounts.length"
              :title="t('payments.screens.providers.empty')"
              :description="t('payments.screens.providers.empty-help')"
              icon="i-lucide-credit-card"
            >
              <template #actions>
                <UButton
                  :label="t('payments.screens.providers.add')"
                  icon="i-lucide-plus"
                  @click="openAdd"
                />
              </template>
            </EmptyState>
            <div
              v-else
              class="grid gap-4 lg:grid-cols-2"
            >
              <UCard
                v-for="a in loaded.accounts"
                :key="a.id"
              >
                <template #header>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="flex-1 font-medium">{{ a.label }}</span>
                    <StatusBadge
                      v-if="a.mode === 'test'"
                      tone="info"
                      :label="t('payments.screens.providers.test-mode')"
                    />
                    <StatusBadge
                      v-if="!a.active"
                      tone="neutral"
                      :label="t('payments.screens.providers.inactive')"
                    />
                    <StatusBadge
                      v-else-if="providerOf(a)?.missingSecrets.length"
                      tone="danger"
                      :label="t('payments.screens.providers.not-ready')"
                    />
                  </div>
                  <p class="text-sm text-muted">
                    {{ providerName(a.provider) }} · {{ a.channels.map(c => t(`payments.screens.channels.${c}`)).join(', ') }}<template v-if="a.externalRef">
                      · {{ a.externalRef }}
                    </template>
                  </p>
                </template>
                <div class="space-y-4">
                  <UAlert
                    v-if="providerOf(a)?.missingSecrets.length"
                    color="error"
                    icon="i-lucide-key-round"
                    :title="t('payments.screens.providers.missing', { secrets: providerOf(a)!.missingSecrets.join(', ') })"
                    :description="t('payments.screens.providers.missing-help')"
                  />
                  <div v-if="providerOf(a)?.capabilities.includes('webhooks')">
                    <p class="text-sm font-medium">
                      {{ t('payments.screens.providers.webhook') }}
                    </p>
                    <p class="text-sm text-muted">
                      {{ t('payments.screens.providers.webhook-help') }}
                    </p>
                    <code class="mt-1 block break-all rounded bg-elevated px-2 py-1 text-xs">{{ webhookAddress(a) }}</code>
                  </div>
                  <PaymentsReaders
                    v-if="providerOf(a)?.pairsReaders"
                    :account-id="a.id"
                    @loaded="list => readers[a.id] = list"
                  />
                  <div
                    v-if="a.mode === 'test'"
                    class="space-y-2"
                  >
                    <div class="flex flex-wrap items-end gap-2">
                      <UFormField
                        v-if="providerOf(a)?.pairsReaders"
                        :label="t('payments.screens.test.reader')"
                      >
                        <USelect
                          v-model="(testing[a.id] ??= { busy: false }).readerId"
                          :items="(readers[a.id] ?? []).map(r => ({ value: r.id, label: r.label }))"
                          size="sm"
                          class="w-48"
                        />
                      </UFormField>
                      <UButton
                        :label="t('payments.screens.test.button', { amount: money(100) })"
                        icon="i-lucide-flask-conical"
                        size="sm"
                        color="neutral"
                        variant="outline"
                        :loading="testing[a.id]?.busy"
                        @click="testPayment(a)"
                      />
                    </div>
                    <RefusalNotice :refusal="testing[a.id]?.refusal ?? null" />
                    <div
                      v-if="testing[a.id]?.next"
                      class="space-y-2 text-sm"
                      aria-live="polite"
                    >
                      <p v-if="testing[a.id]!.state === 'succeeded'">
                        {{ t('payments.screens.test.succeeded') }}
                      </p>
                      <p v-else-if="testing[a.id]!.state === 'failed'">
                        {{ t('payments.screens.test.failed') }}
                      </p>
                      <template v-else>
                        <p>{{ t(`payments.screens.test.next.${testing[a.id]!.next!.kind}`) }}</p>
                        <div class="flex flex-wrap gap-2">
                          <UButton
                            v-if="testing[a.id]!.next!.kind === 'handoff' || testing[a.id]!.next!.kind === 'redirect'"
                            :to="(testing[a.id]!.next as { url: string }).url"
                            external
                            :label="t('payments.screens.test.open')"
                            size="sm"
                          />
                          <UButton
                            :label="t('payments.screens.test.check')"
                            size="sm"
                            color="neutral"
                            variant="outline"
                            @click="checkTest(a)"
                          />
                        </div>
                      </template>
                    </div>
                  </div>
                </div>
              </UCard>
            </div>
          </PageSection>

          <PageSection
            :title="t('payments.screens.providers.available-title')"
            :description="t('payments.screens.providers.available-help')"
          >
            <RecordList :label="t('payments.screens.providers.available-title')">
              <RecordListItem
                v-for="p in loaded.providers"
                :key="p.id"
                :name="providerName(p.id)"
                :description="t(`payments.screens.providers.about.${p.id}`)"
              >
                <StatusBadge
                  v-if="p.missingSecrets.length"
                  tone="warning"
                  :label="t('payments.screens.providers.needs', { secrets: p.missingSecrets.join(', ') })"
                />
                <StatusBadge
                  v-else
                  tone="success"
                  :label="t('payments.screens.providers.ready')"
                />
              </RecordListItem>
            </RecordList>
          </PageSection>
        </div>
      </template>
    </DataBoundary>

    <UModal
      v-model:open="adding"
      :title="t('payments.screens.providers.add')"
    >
      <template #body>
        <UForm
          id="add-provider"
          class="space-y-4"
          :state="form"
          @submit="add"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('payments.screens.providers.provider')"
            required
          >
            <USelect
              v-model="form.provider"
              :items="(data?.providers ?? []).map(p => ({ value: p.id, label: providerName(p.id) }))"
            />
          </UFormField>
          <p
            v-if="chosen"
            class="text-sm text-muted"
          >
            {{ t(`payments.screens.providers.about.${chosen.id}`) }}
          </p>
          <UFormField
            :label="t('payments.screens.providers.label')"
            :help="t('payments.screens.providers.label-help')"
            required
          >
            <UInput
              v-model="form.label"
              maxlength="80"
            />
          </UFormField>
          <UFormField
            v-if="channelsOf(chosen).length > 1"
            :label="t('payments.screens.providers.channels')"
          >
            <UCheckboxGroup
              v-model="form.channels"
              :items="channelsOf(chosen).map(c => ({ value: c, label: t(`payments.screens.channels.${c}`) }))"
            />
          </UFormField>
          <UFormField
            v-if="chosen?.capabilities.includes('test-mode')"
            :label="t('payments.screens.providers.mode')"
          >
            <URadioGroup
              v-model="form.mode"
              :items="[{ value: 'live', label: t('payments.screens.providers.live') }, { value: 'test', label: t('payments.screens.providers.test-mode') }]"
            />
          </UFormField>
          <UFormField
            v-if="form.provider === 'sumup'"
            :label="t('payments.screens.providers.merchant-code')"
            :help="t('payments.screens.providers.merchant-code-help')"
            required
          >
            <UInput
              v-model="form.externalRef"
              maxlength="200"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="add-provider"
          :loading="busy"
          :disabled="!form.provider || !form.label.trim() || !form.channels.length || (form.provider === 'sumup' && !form.externalRef.trim())"
          :label="t('payments.screens.providers.add-button')"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="paying"
      :title="t('payments.screens.payouts.record')"
      :description="t('payments.screens.payouts.help')"
    >
      <template #body>
        <UForm
          id="record-payout"
          class="space-y-4"
          :state="payout"
          @submit="recordPayout"
        >
          <RefusalNotice :refusal="payoutRefusal" />
          <UFormField
            :label="t('payments.screens.payouts.account')"
            required
          >
            <USelect
              v-model="payout.providerAccountId"
              :items="(data?.accounts ?? []).filter(a => a.mode === 'live').map(a => ({ value: a.id, label: a.label }))"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="t('payments.screens.payouts.paid')"
              :help="t('payments.screens.payouts.paid-help')"
              required
            >
              <FieldMoney v-model="payout.paidMinor" />
            </UFormField>
            <UFormField
              :label="t('payments.screens.payouts.fees')"
              :help="t('payments.screens.payouts.fees-help')"
            >
              <FieldMoney v-model="payout.feesMinor" />
            </UFormField>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="t('payments.screens.payouts.paid-on')"
              required
            >
              <FieldDate v-model="payout.paidOn" />
            </UFormField>
            <UFormField
              :label="t('payments.screens.payouts.reference')"
              required
              :error="payoutRefusal?.code === 'payments.payout.already-entered' ? payoutRefusal.reason : undefined"
            >
              <UInput
                v-model="payout.reference"
                maxlength="120"
              />
            </UFormField>
          </div>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="record-payout"
          :loading="busy"
          :disabled="!payout.providerAccountId || payout.paidMinor === null || !payout.paidOn || !payout.reference.trim()"
          :label="t('payments.screens.payouts.record-button')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
