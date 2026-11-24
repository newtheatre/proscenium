<!-- A company's Details tab: what it is called in public and on paper, where to send invoices, and
     notes for staff. Read only to someone who may not change companies. Saving offers Undo. -->
<script setup lang="ts">
import type { CompanyDetail } from '../../shared/views'

const props = defineProps<{ company: CompanyDetail }>()
const emit = defineEmits<{ saved: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { offer } = useUndo()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const FIELDS = ['name', 'publicName', 'legalName', 'registration', 'taxNumber', 'address', 'postcode', 'invoiceEmail', 'website', 'description', 'notes'] as const
type Field = typeof FIELDS[number]
const valuesOf = (c: CompanyDetail) => Object.fromEntries(FIELDS.map(f => [f, c[f] ?? ''])) as Record<Field, string>
const form = reactive(valuesOf(props.company))
watch(() => props.company, c => Object.assign(form, valuesOf(c)))
const formRef = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
const readOnly = computed(() => !props.company.canManage || props.company.archived)

const save = (body: Record<Field, string>) => $api(`/api/companies/${props.company.id}` as string, { method: 'PATCH', body })
async function submit() {
  const before = valuesOf(props.company)
  refusal.value = null
  try {
    await save({ ...form })
    emit('saved')
    offer(t('companies.saved'), async () => {
      await save(before)
      emit('saved')
    })
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formRef.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <UForm
    id="company-details"
    ref="formEl"
    :state="form"
    :disabled="readOnly"
    :validate="() => needs({ name: form.name })"
    class="space-y-6"
    novalidate
    @submit="submit"
  >
    <RefusalNotice :refusal="refusal" />
    <FieldGroup
      :title="t('companies.section.names')"
      first
    >
      <UFormField
        name="name"
        :label="t('companies.field.name')"
        required
      >
        <UInput
          v-model="form.name"
          maxlength="160"
        />
      </UFormField>
      <UFormField
        name="publicName"
        :label="t('companies.field.public-name')"
        :help="t('companies.field.public-name-help')"
      >
        <UInput
          v-model="form.publicName"
          maxlength="160"
        />
      </UFormField>
      <UFormField
        name="website"
        :label="t('companies.field.website')"
        :help="t('companies.field.website-help')"
      >
        <UInput
          v-model="form.website"
          type="url"
          maxlength="300"
        />
      </UFormField>
      <UFormField
        name="description"
        :label="t('companies.field.description')"
      >
        <UTextarea
          v-model="form.description"
          :rows="3"
          maxlength="600"
        />
      </UFormField>
    </FieldGroup>
    <FieldGroup :title="t('companies.section.paperwork')">
      <UFormField
        name="legalName"
        :label="t('companies.field.legal-name')"
      >
        <UInput
          v-model="form.legalName"
          maxlength="200"
        />
      </UFormField>
      <UFormField
        name="registration"
        :label="t('companies.field.registration')"
      >
        <UInput
          v-model="form.registration"
          maxlength="60"
        />
      </UFormField>
      <UFormField
        name="taxNumber"
        :label="t('companies.field.tax-number')"
      >
        <UInput
          v-model="form.taxNumber"
          maxlength="30"
        />
      </UFormField>
      <UFormField
        name="address"
        :label="t('companies.field.address')"
      >
        <UTextarea
          v-model="form.address"
          :rows="3"
          maxlength="400"
        />
      </UFormField>
      <UFormField
        name="postcode"
        :label="t('companies.field.postcode')"
      >
        <UInput
          v-model="form.postcode"
          maxlength="12"
        />
      </UFormField>
      <UFormField
        name="invoiceEmail"
        :label="t('companies.field.invoice-email')"
        :help="t('companies.field.invoice-email-help')"
      >
        <UInput
          v-model="form.invoiceEmail"
          type="email"
          maxlength="254"
        />
      </UFormField>
    </FieldGroup>
    <FieldGroup :title="t('companies.section.notes')">
      <UFormField
        name="notes"
        :label="t('companies.field.notes')"
        :help="t('companies.field.notes-help')"
      >
        <UTextarea
          v-model="form.notes"
          :rows="4"
          maxlength="4000"
        />
      </UFormField>
    </FieldGroup>
    <UButton
      v-if="!readOnly"
      type="submit"
      :label="t('companies.save')"
    />
  </UForm>
</template>
