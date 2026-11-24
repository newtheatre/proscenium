<!-- K1's "New course" and K2's "Edit details" (TR-02): title, summary, whether the training lapses
     and after how long, and whether people sign themselves up. A new course opens on its record. -->
<script setup lang="ts">
import type { Course } from '../../server/courses'

const props = defineProps<{ course?: Course }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [courseId: string] }>()
const { t } = useT()
const act = useTrainingAct()
const toast = useToast()
const { toRefusal } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const saving = ref(false)
const blank = () => ({ title: props.course?.title ?? '', summary: props.course?.summary ?? '', expires: props.course?.expires ?? true, validFor: props.course?.validFor ?? null as number | null, selfSignUp: props.course?.selfSignUp ?? true })
const form = reactive(blank())
watch(open, (now) => {
  if (!now) return
  Object.assign(form, blank())
  refusal.value = null
})

async function save() {
  refusal.value = null
  saving.value = true
  const body = { title: form.title.trim(), summary: form.summary.trim() || null, expires: form.expires, validFor: form.expires ? form.validFor : null, selfSignUp: form.selfSignUp }
  try {
    const id = props.course
      ? (await act(`/api/training/courses/${encodeURIComponent(props.course.id)}`, { method: 'PATCH', body }), props.course.id)
      : (await act<{ courseId: string }>('/api/training/courses', { method: 'POST', body })).courseId
    toast.add({ title: t(props.course ? 'training.course-form.saved' : 'training.course-form.created', { title: body.title }), color: 'success' })
    open.value = false
    emit('saved', id)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t(course ? 'training.course-form.edit' : 'training.course-form.new')"
  >
    <template #body>
      <UForm
        id="training-course-form"
        class="space-y-4"
        :state="form"
        :validate="() => needs({ title: form.title.trim() })"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="title"
          :label="t('training.course-form.title')"
          required
        >
          <UInput
            v-model="form.title"
            maxlength="120"
          />
        </UFormField>
        <UFormField
          name="summary"
          :label="t('training.course-form.summary')"
          :help="t('training.course-form.summary-help')"
        >
          <UTextarea
            v-model="form.summary"
            :rows="3"
            maxlength="500"
          />
        </UFormField>
        <UCheckbox
          v-model="form.expires"
          :label="t('training.course-form.expires')"
          :description="t('training.course-form.expires-help')"
        />
        <UFormField
          v-if="form.expires"
          name="validFor"
          :label="t('training.course-form.valid-for')"
          :help="t('training.course-form.valid-for-help')"
        >
          <DurationInput
            v-model="form.validFor"
            :units="['day', 'month', 'year']"
          />
        </UFormField>
        <UCheckbox
          v-model="form.selfSignUp"
          :label="t('training.course-form.self-sign-up')"
          :description="t('training.course-form.self-sign-up-help')"
        />
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('training.course-form.cancel')"
          @click="open = false"
        />
        <UButton
          type="submit"
          form="training-course-form"
          :loading="saving"
          :label="t(course ? 'training.course-form.save' : 'training.course-form.create')"
        />
      </div>
    </template>
  </UModal>
</template>
