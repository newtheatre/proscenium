<!-- Sending a proposed budget back, or reopening a closed one: either needs a note the others read. -->
<script setup lang="ts">
const props = defineProps<{ budgetId: string }>()
const kind = defineModel<'send-back' | 'reopen' | null>('kind', { default: null })
const emit = defineEmits<{ done: [kind: 'send-back' | 'reopen'] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const form = reactive({ note: '' })
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(kind, (now) => {
  if (!now) return
  form.note = ''
  refusal.value = null
})

async function save() {
  const doing = kind.value!
  refusal.value = null
  try {
    await $api(`/api/budgets/budgets/${props.budgetId}/${doing}` as string, { method: 'POST', body: { note: form.note.trim() } })
    kind.value = null
    emit('done', doing)
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <UModal
    :open="!!kind"
    :title="kind ? t(`budgets.screens.${kind}.title`) : undefined"
    :description="kind ? t(`budgets.screens.${kind}.help`) : undefined"
    @update:open="(v: boolean) => { if (!v) kind = null }"
  >
    <template #body>
      <UForm
        id="budgets-note"
        ref="formEl"
        :state="form"
        :validate="() => needs({ note: form.note })"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="note"
          :label="t('budgets.screens.note')"
          required
        >
          <UTextarea
            v-model="form.note"
            :rows="3"
            maxlength="300"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="budgets-note"
        :loading="formEl?.loading"
        :label="kind ? t(`budgets.screens.${kind}.action`) : ''"
      />
    </template>
  </UModal>
</template>
