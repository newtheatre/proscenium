<!-- Starts a claim (BC-19): what it is for, and the approved request it spends, if any. The claim is
     saved as a draft and opened, so items and receipts are added there. -->
<script setup lang="ts">
interface ApprovedRequest { id: string, lineName: string, budgetName: string, description: string, amountMinor: number, currency: string }

defineProps<{ requests: ApprovedRequest[] }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const text = useBudgetText()
const form = reactive({ title: '', requestId: undefined as string | undefined })
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
let idempotency = ''
watch(open, (now) => {
  if (!now) return
  Object.assign(form, { title: '', requestId: undefined })
  refusal.value = null
  idempotency = crypto.randomUUID()
})

async function save() {
  refusal.value = null
  try {
    const { claimId } = await $api<{ claimId: string }>('/api/budgets/claims' as string, {
      method: 'POST',
      headers: { 'idempotency-key': idempotency },
      body: { title: form.title.trim(), requestId: form.requestId ?? null },
    })
    open.value = false
    await navigateTo(`/members/expenses/claims/${claimId}`)
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
    :title="t('budgets.screens.claims.make')"
    :description="t('budgets.screens.claims.make-help')"
  >
    <template #body>
      <UForm
        id="budgets-claim-new"
        ref="formEl"
        :state="form"
        :validate="() => needs({ title: form.title })"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="title"
          :label="t('budgets.screens.claims.title')"
          :help="t('budgets.screens.claims.title-help')"
          required
        >
          <UInput
            v-model="form.title"
            maxlength="80"
          />
        </UFormField>
        <UFormField
          v-if="requests.length"
          name="requestId"
          :label="t('budgets.screens.claims.request')"
          :help="t('budgets.screens.claims.request-help')"
        >
          <USelectMenu
            v-model="form.requestId"
            value-key="value"
            :items="requests.map(r => ({ value: r.id, label: `${text.money(r.amountMinor, r.currency)}: ${r.lineName}`, description: r.description }))"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="budgets-claim-new"
        :loading="formEl?.loading"
        :label="t('budgets.screens.claims.start')"
      />
    </template>
  </UModal>
</template>
