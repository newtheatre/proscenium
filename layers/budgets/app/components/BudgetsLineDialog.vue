<!-- Adds or edits a budget line. An expense line names what the money is spent on; an income line
     the ledger accounts whose takings it counts. In a draft the amount changes freely; a line added
     to an approved budget says why, and an approved line's amount is revised on its own. -->
<script setup lang="ts">
interface LineInput { id: string, name: string, kind: 'expense' | 'income', categoryId: string | null, sources: string[], draftMinor: number }

const props = defineProps<{
  budgetId: string
  currency: string
  approved: boolean
  line?: LineInput | null
  kind?: 'expense' | 'income'
  categories: { id: string, name: string, archivedAt: number | null }[]
  sources: { key: string, name: string }[]
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const form = reactive({ name: '', kind: 'expense' as 'expense' | 'income', categoryId: undefined as string | undefined, sources: [] as string[], amountMinor: 0 as number | null, reason: '' })
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
let idempotency = ''
watch(open, (now) => {
  if (!now) return
  const l = props.line
  Object.assign(form, { name: l?.name ?? '', kind: l?.kind ?? props.kind ?? 'expense', categoryId: l?.categoryId ?? undefined, sources: [...(l?.sources ?? [])], amountMinor: l?.draftMinor ?? null, reason: '' })
  refusal.value = null
  idempotency = crypto.randomUUID()
})
const adding = computed(() => !props.line)
const categoryItems = computed(() => props.categories.filter(c => !c.archivedAt || c.id === form.categoryId).map(c => ({ value: c.id, label: c.name })))
const sourceItems = computed(() => props.sources.map(s => ({ value: s.key, label: s.name })))
const check = () => needs({
  name: form.name,
  categoryId: form.kind === 'expense' ? form.categoryId : true,
  amountMinor: adding.value || !props.approved ? form.amountMinor : true,
  reason: adding.value && props.approved ? form.reason : true,
})

async function save() {
  refusal.value = null
  try {
    if (adding.value) {
      await $api(`/api/budgets/budgets/${props.budgetId}/lines` as string, {
        method: 'POST',
        headers: { 'idempotency-key': idempotency },
        body: { name: form.name.trim(), kind: form.kind, categoryId: form.kind === 'expense' ? form.categoryId : null, sources: form.kind === 'income' ? form.sources : undefined, amountMinor: form.amountMinor ?? 0, reason: props.approved ? form.reason.trim() : undefined },
      })
    }
    else {
      await $api(`/api/budgets/lines/${props.line!.id}` as string, {
        method: 'PATCH',
        body: {
          name: form.name.trim(),
          ...(form.kind === 'expense' ? { categoryId: form.categoryId } : { sources: form.sources }),
          ...(props.approved ? {} : { amountMinor: form.amountMinor ?? 0 }),
        },
      })
    }
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
    :title="t(adding ? `budgets.screens.line.add-${form.kind}` : 'budgets.screens.line.edit')"
  >
    <template #body>
      <UForm
        id="budgets-line"
        ref="formEl"
        :state="form"
        :validate="check"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="name"
          :label="t('budgets.screens.line.name')"
          :help="t(`budgets.screens.line.name-help-${form.kind}`)"
          required
        >
          <UInput
            v-model="form.name"
            maxlength="80"
          />
        </UFormField>
        <UFormField
          v-if="form.kind === 'expense'"
          name="categoryId"
          :label="t('budgets.screens.line.category')"
          :help="t('budgets.screens.line.category-help')"
          required
        >
          <USelectMenu
            v-model="form.categoryId"
            value-key="value"
            :items="categoryItems"
          />
        </UFormField>
        <UFormField
          v-else
          name="sources"
          :label="t('budgets.screens.line.sources')"
          :help="t('budgets.screens.line.sources-help')"
        >
          <USelectMenu
            v-model="form.sources"
            value-key="value"
            :items="sourceItems"
            multiple
          />
        </UFormField>
        <UFormField
          v-if="adding || !approved"
          name="amountMinor"
          :label="t(`budgets.screens.line.amount-${form.kind}`)"
          required
        >
          <FieldMoney
            v-model="form.amountMinor"
            :currency="currency"
          />
        </UFormField>
        <UFormField
          v-if="adding && approved"
          name="reason"
          :label="t('budgets.screens.line.reason')"
          :help="t('budgets.screens.line.reason-help')"
          required
        >
          <UInput
            v-model="form.reason"
            maxlength="200"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="budgets-line"
        :loading="formEl?.loading"
        :label="t(adding ? 'budgets.screens.line.add' : 'budgets.screens.line.save')"
      />
    </template>
  </UModal>
</template>
