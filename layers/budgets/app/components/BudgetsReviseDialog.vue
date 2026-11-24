<!-- Revising an approved line's amount with a reason (BC-08). Below what is spent and committed, the
     server refuses until the treasurer ticks that they mean it; every approved amount stays in history. -->
<script setup lang="ts">
const props = defineProps<{ line: { id: string, name: string, budgetedMinor: number } | null, currency: string }>()
const emit = defineEmits<{ close: [], revised: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const text = useBudgetText()
const form = reactive({ amountMinor: 0 as number | null, reason: '', confirm: false })
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(() => props.line, (line) => {
  if (!line) return
  Object.assign(form, { amountMinor: line.budgetedMinor, reason: '', confirm: false })
  refusal.value = null
}, { immediate: true })
const belowSpent = computed(() => refusal.value?.code === 'budgets.line.below-spent')

async function save() {
  refusal.value = null
  try {
    await $api(`/api/budgets/lines/${props.line!.id}/revise` as string, { method: 'POST', body: { amountMinor: form.amountMinor ?? 0, reason: form.reason.trim(), confirm: form.confirm || undefined } })
    emit('revised')
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <UModal
    :open="!!line"
    :title="t('budgets.screens.revise.title')"
    :description="line ? t('budgets.screens.revise.help', { name: line.name }) : undefined"
    @update:open="(v: boolean) => { if (!v) emit('close') }"
  >
    <template #body>
      <UForm
        id="budgets-revise"
        ref="formEl"
        :state="form"
        :validate="() => needs({ amountMinor: form.amountMinor, reason: form.reason, confirm: belowSpent ? form.confirm : true })"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="amountMinor"
          :label="t('budgets.screens.revise.amount')"
          required
        >
          <FieldMoney
            v-model="form.amountMinor"
            :currency="currency"
          />
        </UFormField>
        <UFormField
          name="reason"
          :label="t('budgets.screens.revise.reason')"
          required
        >
          <UInput
            v-model="form.reason"
            maxlength="200"
          />
        </UFormField>
        <UFormField
          v-if="belowSpent"
          name="confirm"
        >
          <UCheckbox
            v-model="form.confirm"
            :label="t('budgets.screens.revise.confirm', { amount: text.money(Number(refusal?.detail?.floorMinor ?? 0), currency) })"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="budgets-revise"
        :loading="formEl?.loading"
        :label="t('budgets.screens.revise.save')"
      />
    </template>
  </UModal>
</template>
