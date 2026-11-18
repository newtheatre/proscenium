<!-- Save this form as a template (FB-208): a copy of its questions, stages and wording, as the draft
     stands now, that anybody starting a new form can begin from. -->
<script setup lang="ts">
const props = defineProps<{ formId: string, title: string }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const builder = useBuilder()
const undo = useUndo()
const state = reactive({ name: '', description: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(open, (now) => {
  if (!now) return
  Object.assign(state, { name: props.title, description: '' })
  refusal.value = null
})
async function save() {
  refusal.value = null
  try {
    // The template is made from what is saved, so what is on screen is saved first.
    await builder.flush()
    const { templateId } = await $api<{ templateId: string }>('/api/forms/templates', { method: 'POST', body: { formId: props.formId, name: state.name, description: state.description.trim() || null } })
    open.value = false
    undo.offer(t('forms.screens.templates.saved', { name: state.name.trim() }), () => $api(`/api/forms/templates/${templateId}` as string, { method: 'DELETE', body: {} }))
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('forms.screens.templates.save')"
    :description="t('forms.screens.templates.save-help')"
  >
    <template #body>
      <UForm
        id="forms-template"
        :state="state"
        :validate="() => needs({ name: state.name })"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="name"
          :label="t('forms.screens.templates.name')"
          required
        >
          <UInput
            v-model="state.name"
            maxlength="120"
          />
        </UFormField>
        <UFormField
          name="description"
          :label="t('forms.screens.templates.description')"
          :help="t('forms.screens.templates.description-help')"
          :hint="t('forms.screens.details.optional')"
        >
          <UTextarea
            v-model="state.description"
            :rows="2"
            maxlength="500"
            autoresize
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="forms-template"
        loading-auto
        :label="t('forms.screens.templates.save-button')"
      />
    </template>
  </UModal>
</template>
