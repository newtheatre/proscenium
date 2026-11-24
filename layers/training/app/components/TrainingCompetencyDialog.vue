<!-- K8's "New competency" and "Edit details" (TR-35): a title and what it means. A new one is retired
     until it has a route, and opens on its record. -->
<script setup lang="ts">
import type { Competency } from '../../server/competencies'

const props = defineProps<{ competency?: Competency }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [competencyId: string] }>()
const { t } = useT()
const act = useTrainingAct()
const toast = useToast()
const { refusal, busy, attempt } = useDialogAct()
const form = reactive({ title: '', description: '' })
watch(open, (now) => {
  if (!now) return
  Object.assign(form, { title: props.competency?.title ?? '', description: props.competency?.description ?? '' })
  refusal.value = null
})

async function save() {
  const body = { title: form.title.trim(), description: form.description.trim() || null }
  let id = props.competency?.id ?? ''
  const done = await attempt(async () => {
    if (props.competency) await act(`/api/training/competencies/${encodeURIComponent(id)}`, { method: 'PATCH', body })
    else id = (await act<{ competencyId: string }>('/api/training/competencies', { method: 'POST', body })).competencyId
  })
  if (!done) return
  toast.add({ title: t(props.competency ? 'training.competency-form.saved' : 'training.competency-form.created', { title: body.title }), color: 'success' })
  open.value = false
  emit('saved', id)
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t(competency ? 'training.competency-form.edit' : 'training.competency-form.new')"
    :description="competency ? undefined : t('training.competency-form.new-help')"
  >
    <template #body>
      <UForm
        id="training-competency-form"
        class="space-y-4"
        :state="form"
        :validate="() => needs({ title: form.title })"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="title"
          :label="t('training.competency-form.title')"
          :help="t('training.competency-form.title-help')"
          required
        >
          <UInput
            v-model="form.title"
            maxlength="80"
          />
        </UFormField>
        <UFormField
          name="description"
          :label="t('training.competency-form.description')"
        >
          <UTextarea
            v-model="form.description"
            :rows="3"
            maxlength="500"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('training.session-form.cancel')"
          @click="open = false"
        />
        <UButton
          type="submit"
          form="training-competency-form"
          :loading="busy"
          :label="t(competency ? 'training.competency-form.save' : 'training.competency-form.create')"
        />
      </div>
    </template>
  </UModal>
</template>
