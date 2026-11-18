<!-- A form's own settings: its title, how long its answers are kept, and whether it is anonymous. -->
<script setup lang="ts">
import type { BuilderForm } from '../composables/useFormBuilder'

const props = defineProps<{ form: BuilderForm }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const builder = useBuilder()
const state = reactive({ slug: '', title: '', retentionDays: null as number | null, anonymous: false, allowEdits: false, introduction: '', confirmation: '', submitLabel: '' })
// Custom fields are filled in on their record: nobody is greeted, thanked or asked to send.
const fields = computed(() => props.form.mode === 'record')
// Kept in whole days; asked for as a number and a unit, so two years is not typed as 730.
const DAY = 86_400 // not-policy: seconds in a day
const retention = computed<number | null | undefined>({
  get: () => state.retentionDays === null ? null : state.retentionDays * DAY,
  set: (seconds) => { state.retentionDays = seconds === null || seconds === undefined ? null : Math.max(1, Math.round(seconds / DAY)) },
})
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const formEl = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
watch(open, (now) => {
  if (!now) return
  const shown = builder.definition.value.presentation
  Object.assign(state, { slug: props.form.slug, title: props.form.title, retentionDays: props.form.retentionDays, anonymous: props.form.anonymous, allowEdits: props.form.allowEdits, introduction: shown?.introduction ?? '', confirmation: shown?.confirmation ?? '', submitLabel: shown?.submitLabel ?? '' })
  refusal.value = null
})
async function save() {
  refusal.value = null
  try {
    await $api(`/api/forms/forms/${props.form.id}`, { method: 'PATCH', body: { title: state.title, ...(!fields.value && state.slug.trim() !== props.form.slug ? { slug: state.slug.trim() } : {}), retentionDays: state.retentionDays, ...(fields.value ? {} : { allowEdits: state.allowEdits && !state.anonymous }), ...(props.form.liveVersion === null ? { anonymous: state.anonymous } : {}) } })
    // What people read before and after is part of the form itself: a change to the draft like any other, published with it.
    const was = builder.definition.value.presentation
    const words = { introduction: state.introduction.trim(), confirmation: state.confirmation.trim(), submitLabel: state.submitLabel.trim() }
    if (!fields.value && (Object.keys(words) as (keyof typeof words)[]).some(k => (was?.[k] ?? '') !== words[k])) {
      const presentation = Object.fromEntries(Object.entries({ ...was, ...words }).filter(([, v]) => v !== '' && v !== undefined)) as NonNullable<typeof was>
      const { presentation: _old, ...rest } = builder.definition.value
      const next = Object.keys(presentation).length ? { ...rest, presentation } : rest
      builder.apply(next)
      await builder.flush()
    }
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
          v-if="!fields"
          name="slug"
          :label="t('forms.screens.settings.address')"
          :help="t(form.liveVersion === null ? 'forms.screens.settings.address-help' : 'forms.screens.settings.address-help-live')"
        >
          <UFieldGroup>
            <UBadge
              color="neutral"
              variant="outline"
              size="lg"
              label="/forms/"
            />
            <UInput
              v-model="state.slug"
              maxlength="60"
              autocapitalize="none"
              spellcheck="false"
            />
          </UFieldGroup>
        </UFormField>
        <UFormField
          name="retentionDays"
          :label="t('forms.screens.settings.retention')"
          :help="t('forms.screens.settings.retention-help')"
        >
          <DurationInput
            v-model="retention"
            min="1d"
            :units="['day', 'week', 'month', 'year']"
            :label="t('forms.screens.settings.retention')"
          />
        </UFormField>
        <template v-if="!fields">
          <UFormField
            name="introduction"
            :label="t('forms.screens.settings.introduction')"
            :help="t('forms.screens.settings.introduction-help')"
            :hint="t('forms.screens.details.optional')"
          >
            <UTextarea
              v-model="state.introduction"
              :rows="3"
              autoresize
            />
          </UFormField>
          <UFormField
            name="confirmation"
            :label="t('forms.screens.settings.confirmation')"
            :help="t('forms.screens.settings.confirmation-help')"
            :hint="t('forms.screens.details.optional')"
          >
            <UTextarea
              v-model="state.confirmation"
              :rows="2"
              autoresize
            />
          </UFormField>
          <UFormField
            name="submitLabel"
            :label="t('forms.screens.settings.submit-label')"
            :hint="t('forms.screens.details.optional')"
          >
            <UInput
              v-model="state.submitLabel"
              maxlength="60"
              :placeholder="t('forms.screens.fill.send')"
            />
          </UFormField>
        </template>
        <UFormField
          v-if="!fields"
          name="allowEdits"
          :help="t(state.anonymous ? 'forms.screens.settings.allow-edits-anonymous' : 'forms.screens.settings.allow-edits-help')"
        >
          <USwitch
            v-model="state.allowEdits"
            :disabled="state.anonymous"
            :label="t('forms.screens.settings.allow-edits')"
          />
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
