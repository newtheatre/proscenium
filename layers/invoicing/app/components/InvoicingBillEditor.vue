<!-- A bill (IE-19, wireframe S4): the supplier, their invoice's number and dates, then lines coded to
     expense accounts. While VAT-registered each line takes the VAT as the supplier's invoice shows it,
     with the figure the rate gives beside it and a warning, never a refusal, when they differ (I-43). -->
<script setup lang="ts">
import type { BillBody, BillChoices, SavedBill, SavedBillLine } from '../composables/useBillDraft'

const props = defineProps<{
  choices: BillChoices
  saved?: { bill: SavedBill, lines: SavedBillLine[] }
  currency: string
  saveLabel: string
  /** Sends the bill; a refusal it throws is shown here, beside its field where it names one. */
  submit: (body: BillBody) => Promise<void>
}>()

const { t } = useT()
const { toRefusal, fieldErrors } = useRefusal()
const text = useInvoiceText()
const { form, worked, totals, load, addLine, removeLine, body, missing } = useBillDraft(toRef(props, 'choices'))
watch(() => props.saved, (now) => { if (now) load(now.bill, now.lines) }, { immediate: true })
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function save() {
  refusal.value = null
  try {
    await props.submit(body())
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}

const accountItems = computed(() => props.choices.accounts.map(a => ({ value: a.id, label: a.name, description: a.code })))
const taxItems = computed(() => props.choices.taxCodes.map(c => ({ value: c.code, label: c.label })))
const money = (minor: number) => text.money(minor, props.currency)
const facts = computed(() => props.choices.registered
  ? [
      { label: t('invoicing.screens.invoices.net'), value: money(totals.value.netMinor) },
      { label: t('invoicing.screens.invoices.vat'), value: money(totals.value.taxMinor) },
      { label: t('invoicing.screens.invoices.total'), value: money(totals.value.totalMinor) },
    ]
  : [{ label: t('invoicing.screens.invoices.total'), value: money(totals.value.totalMinor) }])
</script>

<template>
  <UForm
    ref="formEl"
    :state="form"
    :validate="missing"
    class="space-y-6"
    novalidate
    @submit="save"
  >
    <RefusalNotice :refusal="refusal" />
    <FieldGroup
      :title="t('invoicing.screens.bill.supplier-group')"
      first
    >
      <UFormField
        name="billToName"
        :label="t('invoicing.screens.bill.supplier')"
        required
      >
        <UInput
          v-model="form.billToName"
          maxlength="120"
        />
      </UFormField>
      <UFormField
        name="supplierNumber"
        :label="t('invoicing.screens.bill.number')"
        :help="t('invoicing.screens.bill.number-help')"
      >
        <UInput
          v-model="form.supplierNumber"
          maxlength="60"
        />
      </UFormField>
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField
          name="issueOn"
          :label="t('invoicing.screens.bill.issue-on')"
        >
          <FieldDate v-model="form.issueOn" />
        </UFormField>
        <UFormField
          name="dueOn"
          :label="t('invoicing.screens.bill.due-on')"
          :help="t('invoicing.screens.bill.due-on-help')"
        >
          <FieldDate
            v-model="form.dueOn"
            :min="form.issueOn || undefined"
          />
        </UFormField>
      </div>
      <UFormField
        v-if="choices.registered"
        name="taxNumber"
        :label="t('invoicing.screens.bill.tax-number')"
      >
        <UInput
          v-model="form.taxNumber"
          maxlength="30"
        />
      </UFormField>
    </FieldGroup>
    <FieldGroup :title="t('invoicing.screens.draft.lines')">
      <template #actions>
        <UButton
          :label="t('invoicing.screens.draft.add-line')"
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          size="sm"
          @click="addLine"
        />
      </template>
      <div
        v-for="(line, i) in form.lines"
        :key="line.key"
        class="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-start"
      >
        <UFormField
          :name="`lines.${i}.description`"
          :label="t('invoicing.screens.draft.description')"
          class="sm:col-span-3"
          required
        >
          <UInput
            v-model="line.description"
            maxlength="300"
          />
        </UFormField>
        <UFormField
          :name="`lines.${i}.accountId`"
          :label="t('invoicing.screens.bill.account')"
          required
        >
          <USelectMenu
            v-model="line.accountId"
            :items="accountItems"
            value-key="value"
          />
        </UFormField>
        <UFormField
          :name="`lines.${i}.quantity`"
          :label="t('invoicing.screens.draft.quantity')"
        >
          <FieldNumber
            v-model="line.quantity"
            :min="0.001"
            :step="1"
            :step-snapping="false"
            :format-options="{ maximumFractionDigits: 3 }"
          />
        </UFormField>
        <UFormField
          :name="`lines.${i}.unitMinor`"
          :label="t('invoicing.screens.draft.unit-price')"
          required
        >
          <FieldMoney
            v-model="line.unitMinor"
            :currency="currency"
          />
        </UFormField>
        <template v-if="choices.registered">
          <UFormField
            :name="`lines.${i}.taxCode`"
            :label="t('invoicing.screens.draft.tax-code')"
          >
            <USelect
              v-model="line.taxCode"
              :items="taxItems"
            />
          </UFormField>
          <UFormField
            :name="`lines.${i}.taxMinor`"
            :label="t('invoicing.screens.bill.vat')"
            :help="t('invoicing.screens.bill.vat-help', { amount: money(worked[i]!.rateMinor) })"
            class="sm:col-span-2"
          >
            <FieldMoney
              v-model="line.taxMinor"
              :currency="currency"
            />
          </UFormField>
          <UAlert
            v-if="worked[i]!.differs"
            class="sm:col-span-3"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :description="t('invoicing.screens.bill.vat-differs', { worked: money(worked[i]!.rateMinor), typed: money(worked[i]!.taxMinor) })"
          />
        </template>
        <div class="flex items-center justify-between gap-2 sm:col-span-3">
          <span class="text-sm text-muted">{{ t('invoicing.screens.draft.line-total', { amount: money(worked[i]!.netMinor + worked[i]!.taxMinor) }) }}</span>
          <IconButton
            v-if="form.lines.length > 1"
            :label="t('invoicing.screens.draft.remove-line')"
            icon="i-lucide-trash-2"
            @click="removeLine(line.key)"
          />
        </div>
      </div>
      <FactStrip :facts="facts" />
    </FieldGroup>
    <FieldGroup :title="t('invoicing.screens.draft.notes-group')">
      <UFormField
        name="internalNote"
        :label="t('invoicing.screens.draft.internal-note')"
        :help="t('invoicing.screens.bill.internal-note-help')"
      >
        <UTextarea
          v-model="form.internalNote"
          :rows="2"
          maxlength="1000"
        />
      </UFormField>
    </FieldGroup>
    <div class="flex justify-end">
      <UButton
        type="submit"
        :label="saveLabel"
        loading-auto
      />
    </div>
  </UForm>
</template>
