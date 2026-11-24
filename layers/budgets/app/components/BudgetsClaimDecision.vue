<!-- What an approver decides for one item: the line it comes out of, its category, and the amount
     approved; typing less than the receipt asks why, and the claimant reads it. -->
<script setup lang="ts">
import type { ClaimItem } from '../composables/useClaim'

interface Decision { lineId?: string, categoryId?: string, approvedMinor: number | null, partReason: string }
const props = defineProps<{ item: ClaimItem, lines: { value: string, label: string, description?: string }[], categories: { value: string, label: string }[], currency: string }>()
const model = defineModel<Decision>({ required: true })
const { t } = useT()
const part = computed(() => model.value.approvedMinor !== null && model.value.approvedMinor < props.item.amountMinor)
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2">
    <UFormField
      :label="t('budgets.screens.claims.line')"
      required
    >
      <USelectMenu
        v-model="model.lineId"
        value-key="value"
        :items="lines"
      />
    </UFormField>
    <UFormField :label="t('budgets.screens.claims.category')">
      <USelectMenu
        v-model="model.categoryId"
        value-key="value"
        :items="categories"
      />
    </UFormField>
    <UFormField
      :label="t('budgets.screens.claims.approve-amount')"
      required
    >
      <FieldMoney
        v-model="model.approvedMinor"
        :currency="currency"
      />
    </UFormField>
    <UFormField
      v-if="part"
      :label="t('budgets.screens.claims.part-reason')"
      :help="t('budgets.screens.claims.note-help')"
      required
    >
      <UInput
        v-model="model.partReason"
        maxlength="300"
      />
    </UFormField>
  </div>
</template>
