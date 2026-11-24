<!-- Adding or changing someone from the company who will be in the building (CO-24, rule D3). -->
<script setup lang="ts">
import type { PersonRow } from '../../shared/views'

const props = defineProps<{ engagementId: string, person: PersonRow | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [message: string] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = reactive({ name: '', role: '', under18: false })
const formRef = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')

watch(open, (now) => {
  if (!now) return
  refusal.value = null
  const p = props.person
  Object.assign(form, p ? { name: p.name, role: p.role ?? '', under18: p.under18 } : { name: '', role: '', under18: false })
})

async function submit() {
  refusal.value = null
  try {
    const base = `/api/companies/engagements/${props.engagementId}/people`
    if (props.person) await $api(`${base}/${props.person.id}` as string, { method: 'PATCH', body: { ...form } })
    else await $api(base as string, { method: 'POST', body: { ...form } })
    emit('saved', t(props.person ? 'companies.people.changed' : 'companies.people.added', { name: form.name }))
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
    :title="person ? t('companies.people.change', { name: person.name }) : t('companies.people.add')"
  >
    <template #body>
      <UForm
        id="company-person"
        ref="formEl"
        :state="form"
        :validate="() => needs({ name: form.name })"
        class="space-y-4"
        novalidate
        @submit="submit"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="name"
          :label="t('companies.field.person-name')"
          required
        >
          <UInput
            v-model="form.name"
            maxlength="120"
            autocomplete="off"
          />
        </UFormField>
        <UFormField
          name="role"
          :label="t('companies.field.role')"
          :help="t('companies.people.role-help')"
        >
          <UInput
            v-model="form.role"
            maxlength="80"
          />
        </UFormField>
        <UCheckbox
          v-model="form.under18"
          name="under18"
          :label="t('companies.people.under-18')"
          :description="t('companies.people.under-18-help')"
        />
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="company-person"
        :label="person ? t('companies.save') : t('companies.people.add')"
      />
    </template>
  </UModal>
</template>
