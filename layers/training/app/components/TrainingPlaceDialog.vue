<!-- K4's "Add a person" (P1, TR-10): whoever gives places finds a person and gives them one. When the
     session is full they join the waiting list instead, and the toast says which. -->
<script setup lang="ts">
const props = defineProps<{ sessionId: string, exclude: string[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ added: [] }>()
const { t } = useT()
const act = useTrainingAct()
const toast = useToast()
const { refusal, busy, attempt } = useDialogAct()
const form = reactive({ accountId: undefined as string | undefined })
const picked = ref('')
watch(open, (now) => {
  if (!now) return
  form.accountId = undefined
  refusal.value = null
})

async function add() {
  const path = `/api/training/sessions/${encodeURIComponent(props.sessionId)}/places`
  const done = await attempt(async () => {
    const given = await act<{ state: 'booked' | 'waiting' }>(path, { method: 'POST', body: { accountId: form.accountId } })
    toast.add({ title: t(`training.place-form.${given.state}`, { name: picked.value }), color: 'success' })
  })
  if (!done) return
  open.value = false
  emit('added')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('training.place-form.title')"
    :description="t('training.place-form.help')"
  >
    <template #body>
      <UForm
        id="training-place-form"
        class="space-y-4"
        :state="form"
        :validate="() => needs({ accountId: form.accountId })"
        novalidate
        @submit="add"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="accountId"
          :label="t('training.place-form.person')"
          required
        >
          <PersonPicker
            v-model="form.accountId"
            :endpoint="`/api/training/sessions/${encodeURIComponent(sessionId)}/people`"
            :exclude="exclude"
            @picked="p => picked = p?.name ?? p?.label ?? ''"
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
          form="training-place-form"
          :label="t('training.place-form.submit')"
          :loading="busy"
        />
      </div>
    </template>
  </UModal>
</template>
