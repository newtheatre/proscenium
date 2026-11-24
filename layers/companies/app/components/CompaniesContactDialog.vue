<!-- Adding a contact by email (CO-07, rule G2), or changing one: their role, whether they are the
     primary contact and which messages they are sent. A new address makes an unclaimed account. -->
<script setup lang="ts">
import { RECEIVES } from '../../shared/companies'
import type { Receives } from '../../shared/companies'
import type { ContactRow } from '../../shared/views'

const props = defineProps<{ companyId: string, contact: ContactRow | null, hasPrimary: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [message: string] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = reactive({ email: '', name: '', role: '', primary: false, receives: [...RECEIVES] as Receives[], dayPhone: '' })
const formRef = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
const receiveItems = RECEIVES.map(value => ({ value, label: t(`companies.receives.${value}`) }))

watch(open, (now) => {
  if (!now) return
  refusal.value = null
  const c = props.contact
  Object.assign(form, c
    ? { email: c.email ?? '', name: c.name, role: c.role ?? '', primary: c.isPrimary, receives: [...c.receives], dayPhone: c.dayPhone ?? '' }
    : { email: '', name: '', role: '', primary: !props.hasPrimary, receives: [...RECEIVES], dayPhone: '' })
})

const base = computed(() => `/api/companies/${props.companyId}/contacts`)
async function submit() {
  refusal.value = null
  try {
    if (props.contact) {
      await $api(`${base.value}/${props.contact.id}` as string, { method: 'PATCH', body: { role: form.role, receives: form.receives, dayPhone: form.dayPhone, ...(form.primary && !props.contact.isPrimary ? { primary: true } : {}) } })
      emit('saved', t('companies.contacts.changed', { name: props.contact.name }))
    }
    else {
      await $api(base.value as string, { method: 'POST', body: { email: form.email, name: form.name, role: form.role || undefined, primary: form.primary, receives: form.receives, dayPhone: form.dayPhone || undefined } })
      emit('saved', t('companies.contacts.added', { name: form.name || form.email }))
    }
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
    :title="contact ? t('companies.contacts.change', { name: contact.name }) : t('companies.contacts.add')"
    :description="contact ? undefined : t('companies.contacts.add-description')"
  >
    <template #body>
      <UForm
        id="company-contact"
        ref="formEl"
        :state="form"
        :validate="() => contact ? [] : needs({ email: form.email, name: form.name })"
        class="space-y-4"
        novalidate
        @submit="submit"
      >
        <RefusalNotice :refusal="refusal" />
        <template v-if="!contact">
          <UFormField
            name="email"
            :label="t('companies.field.email')"
            required
          >
            <UInput
              v-model="form.email"
              type="email"
              maxlength="254"
              autocomplete="off"
            />
          </UFormField>
          <UFormField
            name="name"
            :label="t('companies.field.person-name')"
            :help="t('companies.field.person-name-help')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="120"
              autocomplete="off"
            />
          </UFormField>
        </template>
        <UFormField
          name="role"
          :label="t('companies.field.role')"
          :help="t('companies.field.role-help')"
        >
          <UInput
            v-model="form.role"
            maxlength="80"
          />
        </UFormField>
        <UFormField
          name="dayPhone"
          :label="t('companies.field.day-phone')"
          :help="t('companies.field.day-phone-help')"
        >
          <UInput
            v-model="form.dayPhone"
            type="tel"
            maxlength="30"
          />
        </UFormField>
        <UFormField
          name="receives"
          :label="t('companies.field.receives')"
        >
          <UCheckboxGroup
            v-model="form.receives"
            :items="receiveItems"
          />
        </UFormField>
        <UCheckbox
          v-model="form.primary"
          name="primary"
          :disabled="contact?.isPrimary"
          :label="t('companies.field.primary')"
          :description="t('companies.field.primary-help')"
        />
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="company-contact"
        :label="contact ? t('companies.save') : t('companies.contacts.add-button')"
      />
    </template>
  </UModal>
</template>
