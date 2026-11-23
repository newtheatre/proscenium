<!-- Entering a provider's payout by hand from its statement (PAY-06): a button that opens the form.
     It draws nothing for someone who may not manage provider accounts, or where no live card
     account exists. Finance's Reconciliation carries it, beside the balances a payout empties. -->
<script setup lang="ts">
interface Provider { id: string, capabilities: string[] }
interface Account { id: string, provider: string, label: string, mode: 'live' | 'test', active: boolean }

const emit = defineEmits<{ recorded: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { toRefusal } = useRefusal()
const toast = useToast()

// Asked in the browser, and a refusal means only that this person does not enter payouts.
const accounts = ref<Account[]>([])
onMounted(async () => {
  try {
    const found = await $api<{ providers: Provider[], accounts: Account[] }>('/api/payments/providers')
    const cash = new Set(found.providers.filter(p => p.capabilities.includes('cash')).map(p => p.id))
    accounts.value = found.accounts.filter(a => a.mode === 'live' && !cash.has(a.provider))
  }
  catch {
    accounts.value = []
  }
})

const open = ref(false)
const busy = ref(false)
const payout = reactive({ providerAccountId: '', paidMinor: null as number | null, feesMinor: 0 as number | null, paidOn: '', reference: '', key: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
function start() {
  Object.assign(payout, { providerAccountId: (accounts.value.find(a => a.active) ?? accounts.value[0])?.id ?? '', paidMinor: null, feesMinor: 0, paidOn: '', reference: '', key: crypto.randomUUID() })
  refusal.value = null
  open.value = true
}
async function record() {
  busy.value = true
  refusal.value = null
  try {
    await $api('/api/payments/payouts', { method: 'POST', body: { providerAccountId: payout.providerAccountId, paidMinor: payout.paidMinor ?? 0, feesMinor: payout.feesMinor ?? 0, paidOn: payout.paidOn, reference: payout.reference }, headers: { 'idempotency-key': payout.key } })
    open.value = false
    toast.add({ title: t('payments.screens.payouts.recorded', { amount: money(payout.paidMinor ?? 0) }), color: 'success' })
    emit('recorded')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UButton
    v-if="accounts.length"
    :label="t('payments.screens.payouts.record')"
    icon="i-lucide-landmark"
    @click="start"
  />
  <UModal
    v-model:open="open"
    :title="t('payments.screens.payouts.record')"
    :description="t('payments.screens.payouts.help')"
  >
    <template #body>
      <UForm
        id="record-payout"
        class="space-y-4"
        :state="payout"
        :validate="() => needs({ providerAccountId: payout.providerAccountId, paidMinor: payout.paidMinor, paidOn: payout.paidOn, reference: payout.reference })"
        novalidate
        @submit="record"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          v-if="accounts.length > 1"
          name="providerAccountId"
          :label="t('payments.screens.payouts.account')"
          required
        >
          <USelectMenu
            v-model="payout.providerAccountId"
            value-key="value"
            :items="accounts.map(a => ({ value: a.id, label: a.label }))"
          />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            name="paidMinor"
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
            name="paidOn"
            :label="t('payments.screens.payouts.paid-on')"
            required
          >
            <FieldDate v-model="payout.paidOn" />
          </UFormField>
          <UFormField
            name="reference"
            :label="t('payments.screens.payouts.reference')"
            required
            :error="refusal?.code === 'payments.payout.already-entered' ? refusal.reason : undefined"
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
        :label="t('payments.screens.payouts.record-button')"
      />
    </template>
  </UModal>
</template>
