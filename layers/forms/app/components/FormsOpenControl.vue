<!-- Whether a published form is taking responses, in one place: open or closed, the button that
     changes it, and the date it closes by itself. A form paused before pausing went reads as closed. -->
<script setup lang="ts">
interface Link { audience: 'anyone' | 'signed_in', opensAt: number | null, closesAt: number | null, responseCap: number | null, onePerPerson: boolean, status: 'active' | 'paused' | 'ended' }

const props = defineProps<{ formId: string, status: string }>()
const emit = defineEmits<{ set: [to: 'live' | 'closed'], saved: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { dateTime } = useDates()
const toast = useToast()
const open = ref(false)
const isOpen = computed(() => props.status === 'live')
const link = ref<Link | null>(null)
const state = reactive({ closesAt: null as number | null })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const formEl = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
async function load() {
  refusal.value = null
  try {
    link.value = (await $api<{ link: Link | null }>(`/api/forms/forms/${props.formId}/link` as string)).link
    state.closesAt = link.value?.closesAt ?? null
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
watch(open, now => now && load())
onMounted(load)
const past = computed(() => isOpen.value && link.value?.closesAt != null && link.value.closesAt <= Date.now())
const label = computed(() => t(isOpen.value && !past.value ? 'forms.screens.open.open' : 'forms.screens.open.closed'))
const about = computed(() => {
  if (!isOpen.value) return t('forms.screens.open.closed-help')
  if (past.value) return t('forms.screens.open.past-help', { when: dateTime(link.value!.closesAt!) })
  return link.value?.closesAt ? t('forms.screens.open.until-help', { when: dateTime(link.value.closesAt) }) : t('forms.screens.open.open-help')
})
function set(to: 'live' | 'closed') {
  open.value = false
  emit('set', to)
}
async function save() {
  if (!link.value) return
  refusal.value = null
  try {
    const { audience, opensAt, responseCap, onePerPerson } = link.value
    await $api(`/api/forms/forms/${props.formId}/link` as string, { method: 'PUT', body: { audience, opensAt, closesAt: state.closesAt, responseCap, onePerPerson, status: 'active' } })
    toast.add({ title: t(state.closesAt ? 'forms.screens.open.date-saved' : 'forms.screens.open.date-cleared'), color: 'success' })
    await load()
    emit('saved')
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ align: 'end' }"
    :ui="{ content: 'w-80 max-w-[calc(100vw-1rem)]' }"
  >
    <UButton
      :label="label"
      :icon="isOpen && !past ? 'i-lucide-circle-dot' : 'i-lucide-circle-stop'"
      trailing-icon="i-lucide-chevron-down"
      color="neutral"
      variant="outline"
      aria-haspopup="dialog"
    />
    <template #content>
      <div
        class="flex flex-col gap-4 p-4"
        role="group"
        :aria-label="t('forms.screens.open.title')"
      >
        <p class="text-sm text-pretty text-muted">
          {{ about }}
        </p>
        <RefusalNotice :refusal="refusal" />
        <UForm
          v-if="isOpen && link"
          ref="formEl"
          :state="state"
          class="flex flex-col gap-3"
          novalidate
          @submit="save"
        >
          <UFormField
            name="closesAt"
            :label="t('forms.screens.open.closes')"
            :hint="t('forms.screens.details.optional')"
          >
            <FieldDateTime v-model="state.closesAt" />
          </UFormField>
          <UButton
            v-if="state.closesAt !== (link.closesAt ?? null)"
            type="submit"
            loading-auto
            color="neutral"
            variant="outline"
            class="self-start"
            :label="t('forms.screens.open.save-date')"
          />
        </UForm>
        <USeparator />
        <UButton
          v-if="isOpen"
          :label="t('forms.screens.life.close')"
          icon="i-lucide-circle-stop"
          color="neutral"
          variant="outline"
          block
          @click="set('closed')"
        />
        <UButton
          v-else
          :label="t('forms.screens.life.reopen')"
          icon="i-lucide-play"
          block
          @click="set('live')"
        />
      </div>
    </template>
  </UPopover>
</template>
