<!-- K4's "Cancel session" (P5, TR-09): names the session and who will be told, and needs a reason,
     which everyone with a place or waiting is sent. Cancelling cannot be undone. -->
<script setup lang="ts">
const props = defineProps<{ sessionId: string, name: string, startsAt: number, booked: number, waiting: number }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ cancelled: [] }>()
const { t } = useT()
const { dayNamed } = useDates()
const act = useTrainingAct()
const toast = useToast()
const { refusal, busy, attempt } = useDialogAct()
const form = reactive({ reason: '' })
watch(open, (now) => {
  if (!now) return
  form.reason = ''
  refusal.value = null
})
const told = computed(() => props.booked + props.waiting
  ? t('training.session-cancel.told', { booked: props.booked, waiting: props.waiting })
  : t('training.session-cancel.nobody'))

async function cancel() {
  const path = `/api/training/sessions/${encodeURIComponent(props.sessionId)}/cancel`
  if (!await attempt(() => act(path, { method: 'POST', body: { reason: form.reason.trim() } }))) return
  toast.add({ title: t('training.session-cancel.done'), color: 'success' })
  open.value = false
  emit('cancelled')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('training.session-cancel.title', { name, day: dayNamed(startsAt) })"
    :description="told"
  >
    <template #body>
      <UForm
        id="training-session-cancel"
        class="space-y-4"
        :state="form"
        :validate="() => needs({ reason: form.reason })"
        novalidate
        @submit="cancel"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="reason"
          :label="t('training.session-cancel.reason')"
          :help="t('training.session-cancel.reason-help')"
          required
        >
          <UTextarea
            v-model="form.reason"
            :rows="3"
            maxlength="300"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('training.session-cancel.keep')"
          @click="open = false"
        />
        <UButton
          type="submit"
          form="training-session-cancel"
          color="error"
          :label="t('training.session-cancel.submit')"
          :loading="busy"
        />
      </div>
    </template>
  </UModal>
</template>
