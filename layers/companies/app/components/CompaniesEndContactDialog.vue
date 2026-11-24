<!-- Ending a contact (rule G4): they stop acting for the company at once. Ending the primary while
     others remain asks who becomes primary; the last contact of a live engagement cannot be ended. -->
<script setup lang="ts">
import type { ContactRow } from '../../shared/views'

const props = defineProps<{ companyId: string, contact: ContactRow | null, others: ContactRow[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ ended: [message: string] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = reactive({ primaryId: '' })
const formRef = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
const choosing = computed(() => !!props.contact?.isPrimary && props.others.length > 0)
const items = computed(() => props.others.map(c => ({ value: c.id, label: c.role ? `${c.name} (${c.role})` : c.name })))

watch(open, (now) => {
  if (!now) return
  refusal.value = null
  form.primaryId = props.others[0]?.id ?? ''
})

async function submit() {
  const c = props.contact!
  refusal.value = null
  try {
    await $api(`/api/companies/${props.companyId}/contacts/${c.id}/end` as string, { method: 'POST', body: choosing.value ? { primaryId: form.primaryId } : {} })
    emit('ended', t('companies.contacts.ended', { name: c.name }))
    open.value = false
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
    :title="t('companies.contacts.end-title', { name: contact?.name ?? '' })"
    :description="t('companies.contacts.end-description')"
  >
    <template #body>
      <UForm
        id="company-contact-end"
        ref="formEl"
        :state="form"
        :validate="() => choosing ? needs({ primaryId: form.primaryId }) : []"
        class="space-y-4"
        novalidate
        @submit="submit"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          v-if="choosing"
          name="primaryId"
          :label="t('companies.contacts.new-primary')"
          required
        >
          <USelect
            v-model="form.primaryId"
            :items="items"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="company-contact-end"
        color="error"
        :label="t('companies.contacts.end-button')"
      />
    </template>
  </UModal>
</template>
