<!-- M8's "Add someone" (P7, TR-12): a person found by name, or a name and an optional address for
     someone without an account. They are given a place and marked here in one act. -->
<script setup lang="ts">
const props = defineProps<{ sessionId: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ added: [] }>()

const { t } = useT()
const act = useTrainingAct()
const toast = useToast()
const { toRefusal } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const blank = () => ({ how: 'find' as 'find' | 'new', accountId: undefined as string | undefined, name: '', address: '' })
const form = reactive(blank())
const picked = ref<string | null>(null)
watch(open, (now) => {
  if (now) {
    Object.assign(form, blank())
    refusal.value = null
  }
})
const howItems = computed(() => [
  { value: 'find', label: t('training.walk-in.find') },
  { value: 'new', label: t('training.walk-in.new') },
])
const validate = () => form.how === 'find' ? needs({ accountId: form.accountId }) : needs({ name: form.name })

async function add() {
  refusal.value = null
  const body = form.how === 'find' ? { accountId: form.accountId } : { name: form.name.trim(), address: form.address.trim() || null }
  try {
    await act(`/api/training/sessions/${encodeURIComponent(props.sessionId)}/walk-ins`, { method: 'POST', body })
    toast.add({ title: t('training.walk-in.added', { name: form.how === 'find' ? picked.value ?? '' : form.name.trim() }), color: 'success' })
    open.value = false
    emit('added')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('training.walk-in.title')"
    :description="t('training.walk-in.description')"
  >
    <template #body>
      <UForm
        id="training-walk-in"
        :state="form"
        :validate="validate"
        class="space-y-4"
        novalidate
        @submit="add"
      >
        <RefusalNotice :refusal="refusal" />
        <URadioGroup
          v-model="form.how"
          :items="howItems"
          orientation="horizontal"
        />
        <UFormField
          v-if="form.how === 'find'"
          :label="t('training.walk-in.person')"
          name="accountId"
          required
        >
          <PersonPicker
            v-model="form.accountId"
            endpoint="/api/training/teaching/people"
            @picked="p => picked = p?.name ?? p?.label ?? null"
          />
        </UFormField>
        <template v-else>
          <UFormField
            :label="t('training.walk-in.name')"
            name="name"
            required
          >
            <UInput
              v-model="form.name"
              autocomplete="off"
            />
          </UFormField>
          <UFormField
            :label="t('training.walk-in.address')"
            :help="t('training.walk-in.address-help')"
            name="address"
          >
            <UInput
              v-model="form.address"
              type="email"
              autocomplete="off"
            />
          </UFormField>
        </template>
        <div class="flex justify-end gap-3">
          <UButton
            color="neutral"
            variant="outline"
            :label="t('training.walk-in.cancel')"
            @click="open = false"
          />
          <UButton
            type="submit"
            icon="i-lucide-user-plus"
            :label="t('training.walk-in.add')"
            loading-auto
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
