<!-- A draft invoice (IE-08, wireframe S2): who it is to, a person with an account or a one-off name
     and address, then its lines, each with what it is, how many, the price, the income account and,
     while VAT-registered, the rate. The totals are worked out as the server will, to the penny. -->
<script setup lang="ts">
import type { DraftBody, DraftChoices, SavedDraft, SavedLine } from '../composables/useInvoiceDraft'

const props = defineProps<{
  choices: DraftChoices
  saved?: { invoice: SavedDraft, lines: SavedLine[] }
  currency: string
  saveLabel: string
  /** Sends the draft; a refusal it throws is shown here, beside its field where it names one. */
  submit: (body: DraftBody) => Promise<void>
}>()

const { t } = useT()
const { toRefusal, fieldErrors } = useRefusal()
const text = useInvoiceText()
const { form, worked, totals, load, addLine, removeLine, body, missing } = useInvoiceDraft(toRef(props, 'choices'))
watch(() => props.saved, (now) => { if (now) load(now.invoice, now.lines) }, { immediate: true })
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

const partyItems = computed(() => [
  { value: 'one-off', label: t('invoicing.screens.draft.party-one-off') },
  { value: 'account', label: t('invoicing.screens.draft.party-account') },
])
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
      :title="t('invoicing.screens.draft.to')"
      first
    >
      <UFormField
        name="partyKind"
        :label="t('invoicing.screens.draft.party')"
      >
        <URadioGroup
          v-model="form.partyKind"
          :items="partyItems"
          orientation="horizontal"
        />
      </UFormField>
      <UFormField
        v-if="form.partyKind === 'account'"
        name="accountId"
        :label="t('invoicing.screens.draft.person')"
        required
      >
        <PersonPicker v-model="form.accountId" />
      </UFormField>
      <UFormField
        name="billToName"
        :label="t('invoicing.screens.draft.name')"
        :help="form.partyKind === 'account' ? t('invoicing.screens.draft.name-help') : undefined"
        :required="form.partyKind === 'one-off'"
      >
        <UInput
          v-model="form.billToName"
          maxlength="120"
        />
      </UFormField>
      <UFormField
        name="billToAddress"
        :label="t('invoicing.screens.draft.address')"
      >
        <UTextarea
          v-model="form.billToAddress"
          :rows="3"
          maxlength="400"
        />
      </UFormField>
      <UFormField
        name="billToEmail"
        :label="t('invoicing.screens.draft.email')"
        :help="t('invoicing.screens.draft.email-help')"
      >
        <UInput
          v-model="form.billToEmail"
          type="email"
          maxlength="254"
        />
      </UFormField>
      <UFormField
        name="reference"
        :label="t('invoicing.screens.draft.reference')"
        :help="t('invoicing.screens.draft.reference-help')"
      >
        <UInput
          v-model="form.reference"
          maxlength="60"
        />
      </UFormField>
      <UFormField
        v-if="choices.registered"
        name="taxNumber"
        :label="t('invoicing.screens.draft.tax-number')"
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
          :label="t('invoicing.screens.draft.account')"
          required
        >
          <USelect
            v-model="line.accountId"
            :items="accountItems"
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
        <UFormField
          v-if="choices.registered"
          :name="`lines.${i}.taxCode`"
          :label="t('invoicing.screens.draft.tax-code')"
        >
          <USelect
            v-model="line.taxCode"
            :items="taxItems"
          />
        </UFormField>
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
        name="notes"
        :label="t('invoicing.screens.draft.notes')"
        :help="t('invoicing.screens.draft.notes-help')"
      >
        <UTextarea
          v-model="form.notes"
          :rows="2"
          maxlength="1000"
        />
      </UFormField>
      <UFormField
        name="internalNote"
        :label="t('invoicing.screens.draft.internal-note')"
        :help="t('invoicing.screens.draft.internal-note-help')"
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
