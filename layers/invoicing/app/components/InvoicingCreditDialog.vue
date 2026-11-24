<!-- Making a credit note (IE-15): tick the lines to credit, each for its whole amount or part of it.
     VAT comes off at the rate the line was charged at, worked as the server works it. The total is
     sent back, so a change meanwhile is refused rather than credited. -->
<script setup lang="ts">
import { lineTax } from '../../shared/invoices'

interface CreditLine { id: string, description: string, netMinor: number, taxMinor: number, taxRateBp: number }
const props = defineProps<{ invoiceId: string, lines: CreditLine[], creditableMinor: number, currency: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ credited: [number: string] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const text = useInvoiceText()
const form = reactive({ lines: [] as { id: string, on: boolean, netMinor: number | null }[] })
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
let idempotency = ''
watch(open, (now) => {
  if (!now) return
  form.lines = props.lines.map(l => ({ id: l.id, on: props.lines.length === 1, netMinor: l.netMinor }))
  refusal.value = null
  idempotency = crypto.randomUUID()
})

const taxOf = (line: CreditLine, net: number) => net === line.netMinor ? line.taxMinor : lineTax(net, line.taxRateBp)
const chosen = computed(() => form.lines.flatMap((f, i) => f.on && f.netMinor ? [{ line: props.lines[i]!, netMinor: f.netMinor }] : []))
const total = computed(() => chosen.value.reduce((n, c) => n + c.netMinor + taxOf(c.line, c.netMinor), 0))
const money = (minor: number) => text.money(minor, props.currency)

function validate() {
  const errors = form.lines.flatMap((f, i) => f.on && (!f.netMinor || f.netMinor > props.lines[i]!.netMinor) ? [{ name: `lines.${i}.netMinor`, message: t('invoicing.screens.credit.line-over', { amount: money(props.lines[i]!.netMinor) }) }] : [])
  if (!chosen.value.length) errors.push({ name: 'lines', message: t('invoicing.screens.credit.none') })
  else if (total.value > props.creditableMinor) errors.push({ name: 'lines', message: t('invoicing.screens.credit.over', { amount: money(props.creditableMinor) }) })
  return errors
}

async function save() {
  refusal.value = null
  try {
    const done = await $api<{ number: string }>(`/api/invoicing/invoices/${props.invoiceId}/credit`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotency },
      body: { lines: chosen.value.map(c => ({ lineId: c.line.id, netMinor: c.netMinor })), expectedTotalMinor: total.value },
    })
    open.value = false
    emit('credited', done.number)
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
    :title="t('invoicing.screens.credit.title')"
    :description="t('invoicing.screens.credit.help', { amount: money(creditableMinor) })"
  >
    <template #body>
      <UForm
        id="invoicing-credit"
        ref="formEl"
        :state="form"
        :validate="validate"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField name="lines">
          <div class="space-y-3">
            <div
              v-for="(line, i) in lines"
              :key="line.id"
              class="grid gap-2 sm:grid-cols-[1fr_10rem] sm:items-start"
            >
              <UCheckbox
                v-model="form.lines[i]!.on"
                :label="line.description"
                :description="money(line.netMinor)"
              />
              <UFormField
                v-if="form.lines[i]?.on"
                :name="`lines.${i}.netMinor`"
                :label="t('invoicing.screens.credit.amount')"
              >
                <FieldMoney
                  v-model="form.lines[i]!.netMinor"
                  :currency="currency"
                  :max="line.netMinor"
                />
              </UFormField>
            </div>
          </div>
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="invoicing-credit"
        :label="t('invoicing.screens.credit.button', { amount: money(total) })"
      />
    </template>
  </UModal>
</template>
