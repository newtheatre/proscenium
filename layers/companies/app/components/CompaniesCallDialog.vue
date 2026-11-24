<!-- Adding or changing a call (CO-23, rules D1 and D2): a get-in, technical, dress, get-out or other call
     in a space, inside one operating day. Something else in the space then only warns. -->
<script setup lang="ts">
import { CALL_KINDS } from '../../shared/companies'
import type { CallKind } from '../../shared/companies'
import type { CallRow } from '../../shared/views'

const props = defineProps<{ engagementId: string, call: CallRow | null, spaces: { value: string, label: string }[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [message: string, warnings: string[]] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = reactive({ kind: 'get-in' as CallKind, spaceId: '', startsAt: null as number | null, endsAt: null as number | null, label: '', notes: '' })
const formRef = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
const kindItems = CALL_KINDS.map(value => ({ value, label: t(`companies.calls.kinds.${value}`) }))

watch(open, (now) => {
  if (!now) return
  refusal.value = null
  const c = props.call
  Object.assign(form, c
    ? { kind: c.kind, spaceId: c.spaceId ?? '', startsAt: c.startsAt, endsAt: c.endsAt, label: c.label ?? '', notes: c.notes ?? '' }
    : { kind: 'get-in', spaceId: props.spaces[0]?.value ?? '', startsAt: null, endsAt: null, label: '', notes: '' })
})

const validate = () => needs({ startsAt: form.startsAt, endsAt: form.endsAt, ...(form.kind === 'other' ? { label: form.label } : {}) })
async function submit() {
  refusal.value = null
  const body = { kind: form.kind, spaceId: form.spaceId || null, startsAt: form.startsAt, endsAt: form.endsAt, label: form.label, notes: form.notes }
  try {
    const base = `/api/companies/engagements/${props.engagementId}/calls`
    const saved = props.call
      ? await $api<{ warnings: string[] }>(`${base}/${props.call.id}` as string, { method: 'PATCH', body })
      : await $api<{ warnings: string[] }>(base as string, { method: 'POST', body })
    emit('saved', t(props.call ? 'companies.calls.changed' : 'companies.calls.added'), saved.warnings)
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
    :title="call ? t('companies.calls.change') : t('companies.calls.add')"
    :description="t('companies.calls.dialog-description')"
  >
    <template #body>
      <UForm
        id="company-call"
        ref="formEl"
        :state="form"
        :validate="validate"
        class="space-y-4"
        novalidate
        @submit="submit"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="kind"
          :label="t('companies.calls.kind')"
          required
        >
          <USelect
            v-model="form.kind"
            :items="kindItems"
          />
        </UFormField>
        <UFormField
          v-if="form.kind === 'other'"
          name="label"
          :label="t('companies.calls.label')"
          required
        >
          <UInput
            v-model="form.label"
            maxlength="80"
          />
        </UFormField>
        <UFormField
          name="spaceId"
          :label="t('companies.calls.space')"
          :help="t('companies.calls.space-help')"
        >
          <USelectMenu
            v-model="form.spaceId"
            :items="spaces"
            value-key="value"
            :search-input="spaces.length > 8"
          />
        </UFormField>
        <UFormField
          name="startsAt"
          :label="t('companies.calls.starts')"
          required
        >
          <FieldDateTime v-model="form.startsAt" />
        </UFormField>
        <UFormField
          name="endsAt"
          :label="t('companies.calls.ends')"
          :help="t('companies.calls.ends-help')"
          required
        >
          <FieldDateTime
            v-model="form.endsAt"
            :min="form.startsAt ?? undefined"
          />
        </UFormField>
        <UFormField
          name="notes"
          :label="t('companies.calls.notes')"
        >
          <UTextarea
            v-model="form.notes"
            maxlength="1000"
            :rows="3"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="company-call"
        :label="call ? t('companies.save') : t('companies.calls.add')"
      />
    </template>
  </UModal>
</template>
