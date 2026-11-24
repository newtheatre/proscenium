<!-- K3's and K2's "New session" and K4's "Edit details" (TR-09): course, when, where, how many places
     and whether people sign themselves up. A new session is unpublished until K4's "Publish". -->
<script setup lang="ts">
import type { Session } from '../../server/sessions'
import type { SessionOptions } from '../../server/console-sessions'

const props = defineProps<{ courseId?: string, session?: Session }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [sessionId: string] }>()
const { t } = useT()
const act = useTrainingAct()
const toast = useToast()
const { toRefusal } = useRefusal()
const { data: options } = useAPI<SessionOptions>('/api/training/console/session-options', { key: 'training:session-options', lazy: true, server: false })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const saving = ref(false)
const NONE = '-'
const fresh = () => ({ courseId: props.courseId, title: '', startsAt: null as number | null, endsAt: null as number | null, spaceId: NONE, placeNote: '', capacity: null as number | null, invited: false })
const blank = () => {
  const s = props.session
  if (!s) return fresh()
  return { courseId: s.courseId, title: s.title ?? '', startsAt: s.startsAt, endsAt: s.endsAt, spaceId: s.spaceId ?? NONE, placeNote: s.placeNote ?? '', capacity: s.capacity as number | null, invited: s.signUp === 'invited' }
}
const form = reactive(blank())
watch(open, (now) => {
  if (!now) return
  Object.assign(form, blank())
  refusal.value = null
})

const spaces = computed(() => [{ value: NONE, label: t('training.session-form.no-space') }, ...(options.value?.spaces ?? [])])
const chooseCourse = computed(() => !props.session && !props.courseId)

function validate() {
  const missing = needs({ courseId: form.courseId, startsAt: form.startsAt, endsAt: form.endsAt })
  if (form.startsAt && form.endsAt && form.endsAt <= form.startsAt) missing.push({ name: 'endsAt', message: t('training.session-form.ends-after') })
  return missing
}

async function save() {
  refusal.value = null
  saving.value = true
  const body = { title: form.title.trim() || null, startsAt: form.startsAt, endsAt: form.endsAt, spaceId: form.spaceId === NONE ? null : form.spaceId, placeNote: form.placeNote.trim() || null, capacity: form.capacity ?? undefined, signUp: form.invited ? 'invited' : 'open' }
  try {
    const id = props.session
      ? (await act(`/api/training/sessions/${encodeURIComponent(props.session.id)}`, { method: 'PATCH', body }), props.session.id)
      : (await act<{ sessionId: string }>(`/api/training/courses/${encodeURIComponent(form.courseId!)}/sessions`, { method: 'POST', body })).sessionId
    toast.add({ title: t(props.session ? 'training.session-form.saved' : 'training.session-form.created'), color: 'success' })
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
    :title="t(session ? 'training.session-form.edit' : 'training.session-form.new')"
    :description="session ? undefined : t('training.session-form.new-help')"
  >
    <template #body>
      <UForm
        id="training-session-form"
        class="space-y-4"
        :state="form"
        :validate="validate"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          v-if="chooseCourse"
          name="courseId"
          :label="t('training.session-form.course')"
          :help="options && !options.courses.length ? t('training.session-form.no-courses') : undefined"
          required
        >
          <USelectMenu
            v-model="form.courseId"
            :items="options?.courses ?? []"
            value-key="value"
          />
        </UFormField>
        <UFormField
          name="title"
          :label="t('training.session-form.title')"
          :help="t('training.session-form.title-help')"
        >
          <UInput
            v-model="form.title"
            maxlength="120"
          />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            name="startsAt"
            :label="t('training.session-form.starts')"
            required
          >
            <FieldDateTime v-model="form.startsAt" />
          </UFormField>
          <UFormField
            name="endsAt"
            :label="t('training.session-form.ends')"
            required
          >
            <FieldDateTime
              v-model="form.endsAt"
              :min="form.startsAt ?? undefined"
            />
          </UFormField>
        </div>
        <UFormField
          name="spaceId"
          :label="t('training.session-form.space')"
          :help="t('training.session-form.space-help')"
        >
          <USelectMenu
            v-model="form.spaceId"
            :items="spaces"
            value-key="value"
          />
        </UFormField>
        <UFormField
          name="placeNote"
          :label="t('training.session-form.place-note')"
          :help="t('training.session-form.place-note-help')"
        >
          <UInput
            v-model="form.placeNote"
            maxlength="200"
          />
        </UFormField>
        <UFormField
          name="capacity"
          :label="t('training.session-form.capacity')"
        >
          <DefaultedNumber
            v-model="form.capacity"
            :fallback="options?.capacity"
            :min="1"
            :label="t('training.session-form.capacity')"
          />
        </UFormField>
        <UCheckbox
          v-model="form.invited"
          :label="t('training.session-form.invited')"
          :description="t('training.session-form.invited-help')"
        />
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
          form="training-session-form"
          :label="t(session ? 'training.session-form.save' : 'training.session-form.create')"
          :loading="saving"
        />
      </div>
    </template>
  </UModal>
</template>
