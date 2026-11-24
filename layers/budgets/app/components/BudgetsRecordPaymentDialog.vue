<!-- Recording that the chosen claims were paid (BC-30): how, when and with what reference. Payments
     records one payment out per claim, each for what is still owed, to the claimant's bank details
     when they are on file. -->
<script setup lang="ts">
import type { ClaimToPay, PayGroup } from '../composables/usePaymentsToMake'

const props = defineProps<{ group: PayGroup | null, claims: ClaimToPay[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ recorded: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { toLocal } = useDates()
const text = useBudgetText()
const METHOD_OF = { 'bank-transfer': 'bank-transfer', 'parent-body': 'parent-body', 'cash': 'petty-cash', 'cheque': 'cheque' } as const
const methods = ['bank-transfer', 'cheque', 'theatre-card', 'petty-cash', 'parent-body'] as const
const methodItems = computed(() => methods.map(m => ({ value: m, label: t(`budgets.screens.to-pay.methods.${m}`) })))
const today = () => toLocal(Date.now()).slice(0, 10) // not-policy: the date part of a local date and time
const form = reactive({ method: 'bank-transfer' as typeof methods[number], paidOn: '', reference: '' })
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
let idempotency = ''
watch(open, (now) => {
  if (!now || !props.group) return
  Object.assign(form, { method: METHOD_OF[props.group.route], paidOn: today(), reference: '' })
  refusal.value = null
  idempotency = crypto.randomUUID()
})
const total = computed(() => props.claims.reduce((sum, c) => sum + c.owedMinor, 0))

async function save() {
  refusal.value = null
  try {
    await $api('/api/payments/disbursements', {
      method: 'POST',
      headers: { 'idempotency-key': idempotency },
      body: { owner: 'budgets', parts: props.claims.map(c => ({ record: c.id, amountMinor: c.owedMinor })), method: form.method, paidOn: form.paidOn, reference: form.reference.trim() || null },
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
    :title="t('budgets.screens.to-pay.record')"
    :description="group ? t('budgets.screens.to-pay.record-help', { person: group.claimant, amount: text.money(total, group.currency), count: claims.length }) : ''"
  >
    <template #body>
      <UForm
        id="budgets-record-payment"
        ref="formEl"
        :state="form"
        :validate="() => needs({ paidOn: form.paidOn })"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="method"
          :label="t('budgets.screens.to-pay.method')"
          required
        >
          <USelect
            v-model="form.method"
            :items="methodItems"
          />
        </UFormField>
        <UFormField
          name="paidOn"
          :label="t('budgets.screens.to-pay.paid-on')"
          required
        >
          <FieldDate
            v-model="form.paidOn"
            :max="today()"
          />
        </UFormField>
        <UFormField
          name="reference"
          :label="t('budgets.screens.to-pay.reference')"
          :help="t('budgets.screens.to-pay.reference-help')"
        >
          <UInput
            v-model="form.reference"
            maxlength="40"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="budgets-record-payment"
        :label="t('budgets.screens.to-pay.record-save', { amount: group ? text.money(total, group.currency) : '' })"
      />
    </template>
  </UModal>
</template>
