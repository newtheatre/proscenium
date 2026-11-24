<!-- Recording money received against an invoice (IE-13, wireframe S6): how much, into which account,
     the day it arrived and the bank's reference or the cheque number. It starts at what is still
     owed; more than that is refused, and the invoice is paid when nothing is left. -->
<script setup lang="ts">
const props = defineProps<{ invoiceId: string, outstandingMinor: number, currency: string, accounts: { id: string, label: string }[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ recorded: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { toLocal } = useDates()
const today = () => toLocal(Date.now()).slice(0, 10) // not-policy: the date part of a local date and time
const form = reactive({ amountMinor: null as number | null, providerAccountId: undefined as string | undefined, receivedOn: '', reference: '' })
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const accountItems = computed(() => props.accounts.map(a => ({ value: a.id, label: a.label })))
let idempotency = ''
watch(open, (now) => {
  if (!now) return
  Object.assign(form, { amountMinor: props.outstandingMinor, providerAccountId: props.accounts.length === 1 ? props.accounts[0]!.id : undefined, receivedOn: today(), reference: '' })
  refusal.value = null
  idempotency = crypto.randomUUID()
})

async function save() {
  refusal.value = null
  try {
    await $api(`/api/invoicing/invoices/${props.invoiceId}/payments`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotency },
      body: { amountMinor: form.amountMinor, providerAccountId: form.providerAccountId, receivedOn: form.receivedOn, reference: form.reference.trim() },
    })
    open.value = false
    emit('recorded')
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('invoicing.screens.payment.title')"
  >
    <template #body>
      <EmptyState
        v-if="!accounts.length"
        icon="i-lucide-landmark"
        :title="t('invoicing.screens.payment.no-accounts')"
        :description="t('invoicing.screens.payment.no-accounts-help')"
      />
      <UForm
        v-else
        id="invoicing-payment"
        ref="formEl"
        :state="form"
        :validate="() => needs({ amountMinor: form.amountMinor, providerAccountId: form.providerAccountId, receivedOn: form.receivedOn, reference: form.reference })"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="amountMinor"
          :label="t('invoicing.screens.payment.amount')"
          required
        >
          <FieldMoney
            v-model="form.amountMinor"
            :currency="currency"
            :min="1"
            :max="outstandingMinor"
          />
        </UFormField>
        <UFormField
          name="providerAccountId"
          :label="t('invoicing.screens.payment.account')"
          required
        >
          <USelect
            v-model="form.providerAccountId"
            :items="accountItems"
          />
        </UFormField>
        <UFormField
          name="receivedOn"
          :label="t('invoicing.screens.payment.received-on')"
          required
        >
          <FieldDate
            v-model="form.receivedOn"
            :max="today()"
          />
        </UFormField>
        <UFormField
          name="reference"
          :label="t('invoicing.screens.payment.reference')"
          :help="t('invoicing.screens.payment.reference-help')"
          required
        >
          <UInput
            v-model="form.reference"
            maxlength="80"
          />
        </UFormField>
      </UForm>
    </template>
    <template
      v-if="accounts.length"
      #footer
    >
      <UButton
        type="submit"
        form="invoicing-payment"
        :label="t('invoicing.screens.payment.save')"
      />
    </template>
  </UModal>
</template>
