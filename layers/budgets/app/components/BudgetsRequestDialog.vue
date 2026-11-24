<!-- Ask to spend (BC-15): a line of an approved budget, an amount, what it is for, and when it is
     needed. The budget's holders are told and decide. -->
<script setup lang="ts">
interface OfferedLine { id: string, name: string, budgetId: string, budgetName: string, currency: string }

const props = defineProps<{ lines: OfferedLine[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const form = reactive({ lineId: undefined as string | undefined, amountMinor: null as number | null, description: '', neededBy: '' })
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
let idempotency = ''
watch(open, (now) => {
  if (!now) return
  Object.assign(form, { lineId: undefined, amountMinor: null, description: '', neededBy: '' })
  refusal.value = null
  idempotency = crypto.randomUUID()
})
const items = computed(() => props.lines.map(l => ({ value: l.id, label: l.name, description: l.budgetName })))
const currency = computed(() => props.lines.find(l => l.id === form.lineId)?.currency ?? props.lines[0]?.currency ?? 'GBP')
const check = () => needs({ lineId: form.lineId, amountMinor: form.amountMinor || undefined, description: form.description })

async function save() {
  refusal.value = null
  try {
    await $api('/api/budgets/requests' as string, {
      method: 'POST',
      headers: { 'idempotency-key': idempotency },
      body: { lineId: form.lineId, amountMinor: form.amountMinor, description: form.description.trim(), neededBy: form.neededBy || null },
    })
    open.value = false
    emit('saved')
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
    :title="t('budgets.screens.requests.ask')"
    :description="t('budgets.screens.requests.ask-help')"
  >
    <template #body>
      <UForm
        id="budgets-request"
        ref="formEl"
        :state="form"
        :validate="check"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="lineId"
          :label="t('budgets.screens.requests.line')"
          :help="t('budgets.screens.requests.line-help')"
          required
        >
          <USelectMenu
            v-model="form.lineId"
            value-key="value"
            :items="items"
          />
        </UFormField>
        <UFormField
          name="amountMinor"
          :label="t('budgets.screens.requests.amount')"
          required
        >
          <FieldMoney
            v-model="form.amountMinor"
            :currency="currency"
          />
        </UFormField>
        <UFormField
          name="description"
          :label="t('budgets.screens.requests.description')"
          :help="t('budgets.screens.requests.description-help')"
          required
        >
          <UTextarea
            v-model="form.description"
            maxlength="500"
            :rows="3"
          />
        </UFormField>
        <UFormField
          name="neededBy"
          :label="t('budgets.screens.requests.needed-by')"
        >
          <FieldDate v-model="form.neededBy" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="budgets-request"
        :loading="formEl?.loading"
        :label="t('budgets.screens.requests.send')"
      />
    </template>
  </UModal>
</template>
