<!-- K2's "Publish" (TR-03, TR-18): puts the version in preparation live. After the first version the
     manager says whether training already held still counts or holders must retrain on what changed,
     and may write what changed. Publishing cannot be taken back, so the dialogue says what follows. -->
<script setup lang="ts">
import { CHANGE_KINDS, type ChangeKind } from '../../shared/states'

const props = defineProps<{ courseId: string, number: number, holders: number }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ published: [] }>()
const { t } = useT()
const act = useTrainingAct()
const toast = useToast()
const { toRefusal } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
const form = reactive({ changeKind: undefined as ChangeKind | undefined, changeNote: '' })
const first = computed(() => props.number === 1)
const kinds = computed(() => CHANGE_KINDS.map(value => ({ value, label: t(`training.change-kinds.${value}`), description: t(`training.publish.${value}-help`, { count: props.holders }) })))
watch(open, (now) => {
  if (!now) return
  Object.assign(form, { changeKind: undefined, changeNote: '' })
  refusal.value = null
})

async function publish() {
  refusal.value = null
  busy.value = true
  try {
    await act(`/api/training/courses/${encodeURIComponent(props.courseId)}/publish`, { method: 'POST', body: { changeKind: first.value ? undefined : form.changeKind, changeNote: form.changeNote.trim() || null } })
    toast.add({ title: t('training.publish.done', { number: props.number }), color: 'success' })
    open.value = false
    emit('published')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('training.publish.title', { number })"
    :description="t(first ? 'training.publish.first' : 'training.publish.next')"
  >
    <template #body>
      <UForm
        id="training-publish-form"
        class="space-y-4"
        :state="form"
        :validate="() => first ? [] : needs({ changeKind: form.changeKind })"
        novalidate
        @submit="publish"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          v-if="!first"
          name="changeKind"
          :label="t('training.publish.change-kind')"
          required
        >
          <URadioGroup
            v-model="form.changeKind"
            :items="kinds"
          />
        </UFormField>
        <UFormField
          name="changeNote"
          :label="t('training.publish.note')"
          :help="t('training.publish.note-help')"
        >
          <UTextarea
            v-model="form.changeNote"
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
          :label="t('training.course-form.cancel')"
          @click="open = false"
        />
        <UButton
          type="submit"
          form="training-publish-form"
          icon="i-lucide-send"
          :loading="busy"
          :label="t('training.publish.submit', { number })"
        />
      </div>
    </template>
  </UModal>
</template>
