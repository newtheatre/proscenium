<!-- A form's own settings: its title, how long its answers are kept, and whether it is anonymous. -->
<script setup lang="ts">
import type { BuilderForm } from '../composables/useFormBuilder'

const props = defineProps<{ form: BuilderForm }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const state = reactive({ title: '', retentionDays: null as number | null, anonymous: false })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const formEl = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
watch(open, (now) => {
  if (!now) return
  Object.assign(state, { title: props.form.title, retentionDays: props.form.retentionDays, anonymous: props.form.anonymous })
  refusal.value = null
})
async function save() {
  refusal.value = null
  try {
    await $api(`/api/forms/forms/${props.form.id}`, { method: 'PATCH', body: { title: state.title, retentionDays: state.retentionDays, ...(props.form.liveVersion === null ? { anonymous: state.anonymous } : {}) } })
    open.value = false
    emit('saved')
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
    :title="t('forms.screens.settings.title')"
  >
    <template #body>
      <UForm
        id="forms-settings"
        ref="formEl"
        :state="state"
        :validate="() => needs({ title: state.title })"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="title"
          :label="t('forms.screens.settings.name')"
          required
        >
          <UInput
            v-model="state.title"
            maxlength="120"
          />
        </UFormField>
        <UFormField
          name="retentionDays"
          :label="t('forms.screens.settings.retention')"
          :help="t('forms.screens.settings.retention-help')"
        >
          <UFieldGroup>
            <UInputNumber
              v-model="state.retentionDays"
              :min="1"
              class="w-32"
            />
            <UBadge
              color="neutral"
              variant="outline"
              :label="t('forms.screens.settings.days')"
            />
          </UFieldGroup>
        </UFormField>
        <UFormField
          name="anonymous"
          :help="t(form.liveVersion === null ? 'forms.screens.settings.anonymous-help' : 'forms.screens.settings.anonymous-fixed')"
        >
          <USwitch
            v-model="state.anonymous"
            :disabled="form.liveVersion !== null"
            :label="t('forms.screens.settings.anonymous')"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="forms-settings"
        loading-auto
        :label="t('forms.screens.settings.save')"
      />
    </template>
  </UModal>
</template>
