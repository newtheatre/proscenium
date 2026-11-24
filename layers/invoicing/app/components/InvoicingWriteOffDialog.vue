<!-- Writing off a debt (IE-27): the whole outstanding goes to bad debts, VAT included, with a reason
     from the list. The amount is sent back, so a payment meanwhile is refused rather than written off. -->
<script setup lang="ts">
const props = defineProps<{ invoiceId: string, outstandingMinor: number, currency: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ written: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const text = useInvoiceText()
const { data: reasons } = await useAPI<{ terms: { id: string, label: string }[] }>('/api/core/vocabularies/invoicing.write-off-reason/terms', { key: 'invoicing:write-off-reasons', default: () => ({ terms: [] }) })
const reasonItems = computed(() => (reasons.value?.terms ?? []).map(r => ({ value: r.id, label: r.label })))
const form = reactive({ reasonTermId: undefined as string | undefined })
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(open, (now) => {
  if (!now) return
  form.reasonTermId = undefined
  refusal.value = null
})

async function save() {
  refusal.value = null
  try {
    await $api(`/api/invoicing/invoices/${props.invoiceId}/write-off`, { method: 'POST', body: { reasonTermId: form.reasonTermId, expectedOutstandingMinor: props.outstandingMinor } })
    open.value = false
    emit('written')
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
    :title="t('invoicing.screens.write-off.title')"
    :description="t('invoicing.screens.write-off.help', { amount: text.money(outstandingMinor, currency) })"
  >
    <template #body>
      <UForm
        id="invoicing-write-off"
        ref="formEl"
        :state="form"
        :validate="() => needs({ reasonTermId: form.reasonTermId })"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="reasonTermId"
          :label="t('invoicing.screens.write-off.reason')"
          required
        >
          <USelect
            v-model="form.reasonTermId"
            :items="reasonItems"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="invoicing-write-off"
        :label="t('invoicing.screens.write-off.button', { amount: text.money(outstandingMinor, currency) })"
      />
    </template>
  </UModal>
</template>
