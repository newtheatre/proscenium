<!-- Lend kit (INV-21): straight from a department to a member or an outside borrower, for a window,
     with the items going. Approved and promised in one step; a clash names each item in the way. -->
<script setup lang="ts">
const { t } = useT()
const { data } = await useAPI<{ lending: { id: string, name: string }[] }>('/api/inventory/loans', { key: 'inventory:loans' })
const lending = computed(() => data.value?.lending ?? [])
const { form, refusal, itemItems, kindItems, clashes, send } = useLendForm(lending)
const lendForm = useFormRef('lendForm')
const departmentItems = computed(() => lending.value.map(d => ({ value: d.id, label: d.name })))
const toast = useToast()

async function submit() {
  const loanId = await send()
  if (!loanId) return
  toast.add({ title: t('inventory.lend.done'), color: 'success' })
  await navigateTo(`/console/inventory/loans/${loanId}`)
}
const validate = () => needs({
  borrower: form.kind === 'member' ? form.borrowerAccountId : form.borrowerName,
  borrowerEmail: form.kind === 'member' ? 'not asked' : form.borrowerEmail,
  dates: form.dates.end,
})
</script>

<template>
  <PageFrame
    :title="t('inventory.loans.lend')"
    :trail="[{ label: t('inventory.navigation.loans.label'), to: '/console/inventory/loans' }]"
    width="reading"
  >
    <UForm
      id="inventory-lend"
      ref="lendForm"
      class="space-y-4"
      :state="form"
      :validate="validate"
      novalidate
      @submit="submit"
    >
      <RefusalNotice :refusal="refusal" />
      <UAlert
        v-if="clashes.length"
        color="warning"
        variant="subtle"
        :title="t('inventory.lend.clashes')"
        :description="clashes.join(', ')"
      />
      <UFormField
        v-if="departmentItems.length > 1"
        :label="t('inventory.item.department')"
      >
        <USelect
          v-model="form.departmentId"
          :items="departmentItems"
        />
      </UFormField>
      <UFormField :label="t('inventory.lend.kind.label')">
        <URadioGroup
          v-model="form.kind"
          :items="kindItems"
          orientation="horizontal"
        />
      </UFormField>
      <UFormField
        v-if="form.kind === 'member'"
        name="borrower"
        :label="t('inventory.lend.member')"
        required
      >
        <PersonPicker
          v-model="form.borrowerAccountId"
          endpoint="/api/inventory/loans/borrowers"
        />
      </UFormField>
      <template v-else>
        <UFormField
          name="borrower"
          :label="t('inventory.lend.name')"
          :help="t('inventory.lend.name-help')"
          required
        >
          <UInput
            v-model="form.borrowerName"
            maxlength="120"
          />
        </UFormField>
        <UFormField
          name="borrowerEmail"
          :label="t('inventory.lend.email')"
          required
        >
          <UInput
            v-model="form.borrowerEmail"
            type="email"
            maxlength="254"
          />
        </UFormField>
      </template>
      <UFormField
        name="dates"
        :label="t('inventory.lend.dates')"
        :help="t('inventory.lend.dates-help')"
        required
      >
        <FieldDateRange v-model="form.dates" />
      </UFormField>
      <UFormField :label="t('inventory.lend.items')">
        <USelectMenu
          v-model="form.itemIds"
          multiple
          value-key="value"
          :items="itemItems"
          :placeholder="t('inventory.lend.items-placeholder')"
          class="min-w-72"
        />
      </UFormField>
      <UFormField :label="t('inventory.lend.purpose')">
        <UTextarea
          v-model="form.purpose"
          maxlength="500"
          :rows="2"
        />
      </UFormField>
      <UButton
        type="submit"
        :loading="lendForm?.loading"
        :label="t('inventory.lend.action')"
      />
    </UForm>
  </PageFrame>
</template>
