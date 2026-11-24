<!-- Recording an answer given on paper (CO-21, rule A3): which contact answered and how. Someone who
     drafted the version cannot record its answer. -->
<script setup lang="ts">
const props = defineProps<{ agreementId: string, version: number, contacts: { accountId: string, name: string }[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ recorded: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = reactive({ responderId: '', answer: 'accepted' as 'accepted' | 'declined' })
const formRef = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
const people = computed(() => props.contacts.map(c => ({ value: c.accountId, label: c.name })))
const answers = computed(() => (['accepted', 'declined'] as const).map(value => ({ value, label: t(`companies.agreements.states.${value}`) })))

watch(open, (now) => {
  if (!now) return
  refusal.value = null
  Object.assign(form, { responderId: props.contacts[0]?.accountId ?? '', answer: 'accepted' })
})

async function submit() {
  refusal.value = null
  try {
    await $api(`/api/companies/agreements/${props.agreementId}/record` as string, { method: 'POST', body: { ...form } })
    open.value = false
    emit('recorded')
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
    :title="t('companies.agreements.record-title', { version })"
    :description="t('companies.agreements.record-description')"
  >
    <template #body>
      <UForm
        id="agreement-record"
        ref="formEl"
        :state="form"
        :validate="() => needs({ responderId: form.responderId })"
        class="space-y-4"
        novalidate
        @submit="submit"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="responderId"
          :label="t('companies.agreements.field.responder')"
          required
        >
          <USelect
            v-model="form.responderId"
            :items="people"
          />
        </UFormField>
        <UFormField
          name="answer"
          :label="t('companies.agreements.field.answer')"
          required
        >
          <USelect
            v-model="form.answer"
            :items="answers"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="agreement-record"
        :label="t('companies.agreements.record-button')"
      />
    </template>
  </UModal>
</template>
