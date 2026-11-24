<!-- One purchase on a claim (BC-19): when and where it was bought, what it was, what it cost and the
     line it comes out of, the line's category unless another fits. Receipts are added on the claim's
     page once the item is saved; without one, the claimant says why. -->
<script setup lang="ts">
import type { ClaimItem } from '../composables/useClaim'

interface OfferedLine { id: string, name: string, budgetId: string, budgetName: string, currency: string }
interface Category { id: string, name: string, description: string }

const props = defineProps<{ claimId: string, item: ClaimItem | null, lines: OfferedLine[], categories: Category[], currency: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const blank = () => ({ spentOn: '', description: '', supplier: '', amountMinor: null as number | null, lineId: undefined as string | undefined, categoryId: undefined as string | undefined, noReceiptReason: '' })
const form = reactive(blank())
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(open, (now) => {
  if (!now) return
  const i = props.item
  Object.assign(form, i
    ? { spentOn: i.spentOn, description: i.description, supplier: i.supplier ?? '', amountMinor: i.amountMinor, lineId: i.lineId ?? undefined, categoryId: i.categoryId ?? undefined, noReceiptReason: i.noReceiptReason ?? '' }
    : blank())
  refusal.value = null
})
const lineItems = computed(() => props.lines.map(l => ({ value: l.id, label: l.name, description: l.budgetName })))
const categoryItems = computed(() => props.categories.map(c => ({ value: c.id, label: c.name, description: c.description || undefined })))
const check = () => needs({ spentOn: form.spentOn, description: form.description, amountMinor: form.amountMinor || undefined, lineId: form.lineId })

async function save() {
  refusal.value = null
  const body = {
    spentOn: form.spentOn,
    description: form.description.trim(),
    supplier: form.supplier.trim() || null,
    amountMinor: form.amountMinor,
    lineId: form.lineId ?? null,
    categoryId: form.categoryId ?? null,
    noReceiptReason: form.noReceiptReason.trim() || null,
  }
  const base = `/api/budgets/claims/${props.claimId}/items`
  try {
    if (props.item) await $api(`${base}/${props.item.id}` as string, { method: 'PATCH', body })
    else await $api(base as string, { method: 'POST', body })
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
    :title="t(item ? 'budgets.screens.claims.item-edit' : 'budgets.screens.claims.item-add')"
  >
    <template #body>
      <UForm
        id="budgets-claim-item"
        ref="formEl"
        :state="form"
        :validate="check"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="description"
          :label="t('budgets.screens.claims.description')"
          :help="t('budgets.screens.claims.description-help')"
          required
        >
          <UInput
            v-model="form.description"
            maxlength="200"
          />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            name="amountMinor"
            :label="t('budgets.screens.claims.amount')"
            required
          >
            <FieldMoney
              v-model="form.amountMinor"
              :currency="currency"
            />
          </UFormField>
          <UFormField
            name="spentOn"
            :label="t('budgets.screens.claims.spent-on')"
            required
          >
            <FieldDate v-model="form.spentOn" />
          </UFormField>
        </div>
        <UFormField
          name="supplier"
          :label="t('budgets.screens.claims.supplier')"
        >
          <UInput
            v-model="form.supplier"
            maxlength="80"
          />
        </UFormField>
        <UFormField
          name="lineId"
          :label="t('budgets.screens.claims.line')"
          :help="t('budgets.screens.claims.line-help')"
          required
        >
          <USelectMenu
            v-model="form.lineId"
            value-key="value"
            :items="lineItems"
          />
        </UFormField>
        <UFormField
          name="categoryId"
          :label="t('budgets.screens.claims.category')"
          :help="t('budgets.screens.claims.category-help')"
        >
          <USelectMenu
            v-model="form.categoryId"
            value-key="value"
            :items="categoryItems"
          />
        </UFormField>
        <UFormField
          name="noReceiptReason"
          :label="t('budgets.screens.claims.no-receipt')"
          :help="t('budgets.screens.claims.no-receipt-help')"
        >
          <UInput
            v-model="form.noReceiptReason"
            maxlength="300"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="budgets-claim-item"
        :loading="formEl?.loading"
        :label="t('budgets.screens.claims.item-save')"
      />
    </template>
  </UModal>
</template>
