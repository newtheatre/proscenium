<!-- Cancelling an engagement (rule E5, CO-16) with a reason: guest places are released and an agreement
     waiting for an answer is withdrawn; the production itself is left as it is. -->
<script setup lang="ts">
const props = defineProps<{ engagementId: string, title: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ cancelled: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = reactive({ reason: '' })
const formRef = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')

watch(open, (now) => {
  if (!now) return
  refusal.value = null
  form.reason = ''
})

async function submit() {
  refusal.value = null
  try {
    await $api(`/api/companies/engagements/${props.engagementId}/cancel` as string, { method: 'POST', body: { reason: form.reason } })
    open.value = false
    emit('cancelled')
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formRef.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('companies.engagements.cancel-title', { title })"
    :description="t('companies.engagements.cancel-description')"
  >
    <template #body>
      <UForm
        id="engagement-cancel"
        ref="formEl"
        :state="form"
        :validate="() => needs({ reason: form.reason })"
        class="space-y-4"
        novalidate
        @submit="submit"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="reason"
          :label="t('companies.field.cancel-reason')"
          required
        >
          <UTextarea
            v-model="form.reason"
            :rows="3"
            maxlength="500"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="engagement-cancel"
        color="error"
        :label="t('companies.engagements.cancel-button')"
      />
    </template>
  </UModal>
</template>
