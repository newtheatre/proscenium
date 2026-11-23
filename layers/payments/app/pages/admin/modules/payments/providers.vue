<!-- Providers and readers (Box office specification, part 5; PAY-01, PAY-02): the payment providers
     this site can use, chosen from when an account is added; and the accounts set up with them, each
     a small card of one size. Payouts are entered on Reconciliation. An account's keys (on the
     KeysCard every page uses), notification address, card readers, test payment and taking it out of use open in a
     slide-over from its card. -->
<script setup lang="ts">
interface Provider { id: string, capabilities: string[], methods: { method: string, channels: string[] }[], pairsReaders: boolean }
interface Key { name: string, source: 'saved' | 'saved-for-module' | null, hint: string | null, start?: string | null }
interface Account { id: string, provider: string, label: string, channels: string[], mode: 'live' | 'test', externalRef: string | null, active: boolean, keys: Key[], missingKeys: string[] }
type Next = { kind: 'redirect' | 'handoff', url: string } | { kind: 'client-secret', provider: string, secret: string, publishableKey: string } | { kind: 'waiting-for-reader' } | { kind: 'none' }

const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ providers: Provider[], accounts: Account[] }>('/api/payments/providers', { key: 'payments:providers' })

const providerName = (id: string) => t(`payments.screens.providers.names.${id}`)
const providerOf = (a: Account) => data.value?.providers.find(p => p.id === a.provider)
const channelNames = (a: Account) => a.channels.map(c => t(`payments.screens.channels.${c}`)).join(', ')
// The provider's name is left out when the account is named after it, so cash reads "Cash · At the desk".
const summaryOf = (a: Account) => [a.label === providerName(a.provider) ? null : providerName(a.provider), channelNames(a), a.externalRef].filter(Boolean).join(' · ')
const iconOf = (a: Account) => {
  const p = providerOf(a)
  if (p?.methods.every(m => m.method === 'cash')) return 'i-lucide-banknote'
  if (p?.pairsReaders) return 'i-lucide-smartphone-nfc'
  return 'i-lucide-credit-card'
}
// Whether the account has anything to show or change beyond its card.
const hasDetails = (a: Account) => {
  const p = providerOf(a)
  return a.keys.length > 0 || a.missingKeys.length > 0 || a.mode === 'test' || !!p?.pairsReaders || !!p?.capabilities.includes('webhooks')
}
const managing = ref<string | null>(null)
const managed = computed(() => data.value?.accounts.find(a => a.id === managing.value))
// Taking an account out of use, or putting it back: payments stop being offered through it, nothing else changes.
const switching = ref(false)
async function setActive(a: Account, active: boolean, undoable = true) {
  switching.value = true
  try {
    await $api(`/api/payments/providers/${a.id}` as string, { method: 'PATCH', body: { active } })
    await refresh()
    toast.add({
      title: t(active ? 'payments.screens.providers.switched-on' : 'payments.screens.providers.switched-off', { account: a.label }),
      color: 'success',
      actions: undoable ? [{ label: t('core.undo.button'), icon: 'i-lucide-undo-2', color: 'neutral', variant: 'outline', onClick: () => { void setActive(a, !active, false) } }] : undefined,
    })
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
  finally {
    switching.value = false
  }
}
const webhookAddress = (a: Account) => (import.meta.client ? `${window.location.origin}/api/payments/webhooks/${a.id}` : `/api/payments/webhooks/${a.id}`)

// Adding an account.
const adding = ref(false)
const form = reactive({ provider: '', label: '', channels: [] as string[], mode: 'live' as 'live' | 'test', externalRef: '', key: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
const chosen = computed(() => data.value?.providers.find(p => p.id === form.provider))
const channelsOf = (p: Provider | undefined) => [...new Set(p?.methods.flatMap(m => m.channels) ?? [])]
watch(() => form.provider, (provider, before) => {
  form.channels = channelsOf(chosen.value)
  // Starts the name as the provider's own, such as Cash, until someone types another.
  if (!form.label.trim() || (before && form.label === providerName(before))) form.label = provider ? providerName(provider) : ''
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
// Where a test card that needs its bank's page comes back to: this screen.
const returnUrl = `${useRequestURL().origin}/admin/modules/payments/providers`
async function checkTest(a: Account) {
  const run = testing[a.id]
  if (!run?.intentId) return
  try {
    // Asks the provider now, so a test payment made in the card form shows without its webhook.
    const status = await $api<{ state: string, paidMinor: number, waiting: boolean }>(`/api/payments/intents/${run.intentId}/refresh` as string, { method: 'POST', body: {} })
    run.state = status.waiting ? 'pending' : status.paidMinor > 0 ? 'succeeded' : status.state
  }
  catch (e) {
    run.refusal = toRefusal(e)
  }
}

// An account's keys, typed here instead of in Cloudflare, on the KeysCard every page uses.
const keyId = (name: string) => name.toLowerCase().replaceAll('_', '-')
const keyLabel = (name: string) => t(`payments.screens.providers.keys.${keyId(name)}.label`)
const keyItems = (a: Account) => a.keys.map(k => ({ ...k, label: keyLabel(k.name), help: t(`payments.screens.providers.keys.${keyId(k.name)}.help`) }))
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
            <ul
              v-else
              class="grid gap-4 md:grid-cols-2"
            >
              <li
                v-for="a in loaded.accounts"
                :key="a.id"
              >
                <UCard
                  class="h-full"
                  :ui="{ root: 'flex h-full flex-col', body: 'flex flex-1 flex-col justify-between gap-3' }"
                >
                  <div class="flex items-start gap-3">
                    <div class="rounded-md bg-elevated p-2">
                      <UIcon
                        :name="iconOf(a)"
                        class="size-5"
                      />
                    </div>
                    <div class="min-w-0 flex-1">
                      <h3 class="truncate font-medium text-highlighted">
                        {{ a.label }}
                      </h3>
                      <p class="text-sm text-muted">
                        {{ summaryOf(a) }}
                      </p>
                    </div>
                  </div>
                  <div class="flex min-h-8 items-center gap-2">
                    <div class="flex flex-1 flex-wrap items-center gap-2">
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
                        v-else-if="a.missingKeys.length"
                        tone="danger"
                        :label="t('payments.screens.providers.not-ready')"
                      />
                      <span
                        v-else-if="!hasDetails(a)"
                        class="text-sm text-muted"
                      >{{ t('payments.screens.providers.nothing-to-set-up') }}</span>
                      <StatusBadge
                        v-else
                        tone="success"
                        :label="t('payments.screens.providers.ready')"
                      />
                    </div>
                    <UButton
                      class="shrink-0"
                      :label="t('payments.screens.providers.manage')"
                      :aria-label="t('payments.screens.providers.manage-account', { account: a.label })"
                      trailing-icon="i-lucide-chevron-right"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      @click="managing = a.id"
                    />
                  </div>
                </UCard>
              </li>
            </ul>
          </PageSection>
        </div>
      </template>
    </DataBoundary>

    <USlideover
      :open="!!managed"
      :title="managed?.label"
      :description="managed ? summaryOf(managed) : undefined"
      @update:open="open => { if (!open) managing = null }"
    >
      <template #body>
        <template
          v-for="a in managed ? [managed] : []"
          :key="a.id"
        >
          <div class="space-y-4">
            <UAlert
              v-if="a.missingKeys.length"
              color="error"
              icon="i-lucide-key-round"
              :title="t('payments.screens.providers.missing', { secrets: a.missingKeys.map(keyLabel).join(', ') })"
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
            <KeysCard
              v-if="a.keys.length"
              :keys="keyItems(a)"
              :save-to="`/api/payments/providers/${a.id}/keys`"
              @saved="refresh()"
            />
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
                  <PaymentsCardForm
                    v-if="testing[a.id]!.next!.kind === 'client-secret'"
                    :next="testing[a.id]!.next as Extract<Next, { kind: 'client-secret' }>"
                    :label="t('payments.screens.test.pay', { amount: money(100) })"
                    :return-url="returnUrl"
                    @submitted="checkTest(a)"
                  />
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
        </template>
      </template>
      <template
        v-if="managed"
        #footer
      >
        <UButton
          :label="managed.active ? t('payments.screens.providers.switch-off') : t('payments.screens.providers.switch-on')"
          :icon="managed.active ? 'i-lucide-circle-pause' : 'i-lucide-circle-play'"
          color="neutral"
          variant="outline"
          :loading="switching"
          @click="setActive(managed, !managed.active)"
        />
      </template>
    </USlideover>

    <UModal
      v-model:open="adding"
      :title="t('payments.screens.providers.add')"
    >
      <template #body>
        <UForm
          id="add-provider"
          class="space-y-4"
          :state="form"
          :validate="() => needs({ provider: form.provider, label: form.label, channels: form.channels, externalRef: form.provider === 'sumup' ? form.externalRef : true })"
          novalidate
          @submit="add"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="provider"
            :label="t('payments.screens.providers.provider')"
            required
          >
            <URadioGroup
              v-model="form.provider"
              variant="card"
              :items="(data?.providers ?? []).map(p => ({ value: p.id, label: providerName(p.id), description: t(`payments.screens.providers.about.${p.id}`) }))"
            />
          </UFormField>
          <UFormField
            name="label"
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
            name="channels"
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
            name="externalRef"
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
          :label="t('payments.screens.providers.add-button')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
