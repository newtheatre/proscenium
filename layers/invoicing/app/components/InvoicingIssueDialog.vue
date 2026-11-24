<!-- Issuing a draft (IE-09): the total it goes out for and the date it carries, today unless the work
     was earlier. Issuing numbers it from its series and posts it; after that it changes only by a
     credit note. The total shown is sent back, so a draft changed meanwhile is refused, not issued. -->
<script setup lang="ts">
const props = defineProps<{ invoiceId: string, version: number, totalMinor: number, currency: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ issued: [number: string] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { toLocal } = useDates()
const text = useInvoiceText()
const today = () => toLocal(Date.now()).slice(0, 10) // not-policy: the date part of a local date and time
const form = reactive({ issueOn: '' })
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(open, (now) => {
  if (!now) return
  form.issueOn = today()
  refusal.value = null
})

async function issue() {
  refusal.value = null
  try {
    const done = await $api<{ number: string }>(`/api/invoicing/invoices/${props.invoiceId}/issue`, {
      method: 'POST',
      body: { version: props.version, expectedTotalMinor: props.totalMinor, ...(form.issueOn === today() ? {} : { issueOn: form.issueOn }) },
    })
    open.value = false
    emit('issued', done.number)
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
    :title="t('invoicing.screens.issue.title')"
    :description="t('invoicing.screens.issue.help', { amount: text.money(totalMinor, currency) })"
  >
    <template #body>
      <UForm
        id="invoicing-issue"
        ref="formEl"
        :state="form"
        :validate="() => needs({ issueOn: form.issueOn })"
        class="space-y-4"
        novalidate
        @submit="issue"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="issueOn"
          :label="t('invoicing.screens.issue.date')"
          :help="t('invoicing.screens.issue.date-help')"
          required
        >
          <FieldDate
            v-model="form.issueOn"
            :max="today()"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="invoicing-issue"
        :label="t('invoicing.screens.issue.button', { amount: text.money(totalMinor, currency) })"
      />
    </template>
  </UModal>
</template>
