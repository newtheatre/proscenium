<!-- Renaming a budget. -->
<script setup lang="ts">
const props = defineProps<{ budgetId: string, name: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ renamed: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const form = reactive({ name: '' })
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(open, (now) => {
  if (!now) return
  form.name = props.name
  refusal.value = null
})

async function save() {
  refusal.value = null
  try {
    await $api(`/api/budgets/budgets/${props.budgetId}` as string, { method: 'PATCH', body: { name: form.name.trim() } })
    open.value = false
    emit('renamed')
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
    :title="t('budgets.screens.rename.action')"
  >
    <template #body>
      <UForm
        id="budgets-rename"
        ref="formEl"
        :state="form"
        :validate="() => needs({ name: form.name })"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="name"
          :label="t('budgets.screens.new.name')"
          required
        >
          <UInput
            v-model="form.name"
            maxlength="80"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="budgets-rename"
        :loading="formEl?.loading"
        :label="t('budgets.screens.line.save')"
      />
    </template>
  </UModal>
</template>
