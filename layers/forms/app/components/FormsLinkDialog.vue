<!-- Sharing a form (FB-301): its address, who may answer, when it opens, how many responses it
     takes and whether each person may answer once. Whether it is open, and when it closes, belong
     to the builder's Open control. The same terms apply where a form is attached to another
     module's record (`place`): there it also has a closing date and a switch, and saving attaches it. -->
<script setup lang="ts">
interface Link { audience: 'anyone' | 'signed_in', opensAt: number | null, closesAt: number | null, responseCap: number | null, responseCount: number, onePerPerson: boolean, status: 'active' | 'paused' | 'ended' }

const props = defineProps<{ formId: string, anonymous: boolean, place?: { slot: string, subject: string } }>()
const emit = defineEmits<{ saved: [] }>()
const at = computed(() => props.place ? `/api/forms/slots/${encodeURIComponent(props.place.slot)}/${encodeURIComponent(props.place.subject)}` : '')
const open = defineModel<boolean>('open', { default: false })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const toast = useToast()
const copied = ref(false)
async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000) // not-policy: how long the button says it copied
}

const state = reactive({ audience: 'anyone' as Link['audience'], opensAt: null as number | null, closesAt: null as number | null, responseCap: null as number | null, onePerPerson: false, taking: true })
const address = ref('')
const shared = ref(false)
const count = ref(0)
const published = ref(true)
/** What a move does only where the form is attached to a record, which this link is not. */
const elsewhere = ref<string[]>([])
const loading = ref(false)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const formEl = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
const audiences = computed(() => (['anyone', 'signed_in'] as const).map(value => ({ value, label: t(`forms.screens.link.audience-${value}`) })))

watch(open, async (now) => {
  if (!now) return
  refusal.value = null
  loading.value = true
  try {
    const got = props.place
      ? await $api<{ attached: (Link & { formId: string, address: string })[] }>(at.value).then((there) => {
          const link = there.attached.find(a => a.formId === props.formId) ?? null
          return { link, address: link?.address ?? '', published: true, elsewhere: [] as string[] }
        })
      : await $api<{ link: Link | null, address: string, published: boolean, elsewhere: string[] }>(`/api/forms/forms/${props.formId}/link` as string)
    address.value = got.address
    published.value = got.published
    elsewhere.value = got.elsewhere
    shared.value = got.link !== null
    count.value = got.link?.responseCount ?? 0
    Object.assign(state, got.link
      ? { audience: got.link.audience, opensAt: got.link.opensAt, closesAt: got.link.closesAt, responseCap: got.link.responseCap, onePerPerson: got.link.onePerPerson, taking: got.link.status === 'active' }
      : { audience: props.place ? 'signed_in' : 'anyone', opensAt: null, closesAt: null, responseCap: null, onePerPerson: false, taking: true })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  loading.value = false
// Immediately too: where a form is attached, the dialog is made already open.
}, { immediate: true })

async function save() {
  refusal.value = null
  try {
    await $api((props.place ? `${at.value}/${props.formId}` : `/api/forms/forms/${props.formId}/link`) as string, { method: 'PUT', body: { audience: state.audience, opensAt: state.opensAt, closesAt: state.closesAt, responseCap: state.responseCap, onePerPerson: state.onePerPerson, status: props.place && !state.taking ? 'paused' : 'active' } })
    toast.add({ title: t(shared.value ? 'forms.screens.link.saved' : props.place ? 'forms.screens.slot.attached' : 'forms.screens.link.shared'), color: 'success' })
    shared.value = true
    emit('saved')
    if (props.place) open.value = false
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
    :title="t(place ? 'forms.screens.slot.terms' : 'forms.screens.link.title')"
    :description="t(place ? 'forms.screens.slot.terms-help' : 'forms.screens.link.help')"
  >
    <template #body>
      <UAlert
        v-if="!published"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="t('forms.screens.link.unpublished')"
      />
      <UForm
        v-else
        id="forms-link"
        ref="formEl"
        :state="state"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UAlert
          v-if="elsewhere.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('forms.screens.link.elsewhere')"
          :description="t('forms.screens.link.elsewhere-help', { what: elsewhere.map(key => t(key)).join(', ') })"
        />
        <UFormField
          v-if="!place || shared"
          :label="t('forms.screens.link.address')"
          :help="shared ? t('forms.screens.link.responses', { count }) : t('forms.screens.link.not-shared')"
        >
          <UFieldGroup class="flex">
            <UInput
              :model-value="address"
              readonly
              class="min-w-0 flex-1"
            />
            <UButton
              color="neutral"
              variant="outline"
              :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="copied ? t('forms.screens.json.copied') : t('forms.screens.json.copy')"
              @click="copy(address)"
            />
          </UFieldGroup>
        </UFormField>
        <UFormField
          name="audience"
          :label="t('forms.screens.link.audience')"
        >
          <USelect
            v-model="state.audience"
            :items="audiences"
            class="min-w-56"
          />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            name="opensAt"
            :label="t('forms.screens.link.opens')"
            :hint="t('forms.screens.details.optional')"
          >
            <FieldDateTime v-model="state.opensAt" />
          </UFormField>
          <UFormField
            v-if="place"
            name="closesAt"
            :label="t('forms.screens.link.closes')"
            :hint="t('forms.screens.details.optional')"
          >
            <FieldDateTime v-model="state.closesAt" />
          </UFormField>
        </div>
        <UFormField
          name="responseCap"
          :label="t('forms.screens.link.cap')"
          :hint="t('forms.screens.details.optional')"
          :help="t('forms.screens.link.cap-help')"
        >
          <FieldNumber
            v-model="state.responseCap"
            :min="1"
          />
        </UFormField>
        <UFormField
          name="onePerPerson"
          :help="anonymous ? t('forms.screens.link.once-anonymous') : t('forms.screens.link.once-help')"
        >
          <USwitch
            v-model="state.onePerPerson"
            :disabled="anonymous"
            :label="t('forms.screens.link.once')"
          />
        </UFormField>
        <UFormField
          v-if="place"
          name="status"
          :help="t('forms.screens.link.taking-help')"
        >
          <USwitch
            v-model="state.taking"
            :label="t('forms.screens.link.taking')"
          />
        </UFormField>
      </UForm>
    </template>
    <template
      v-if="published"
      #footer
    >
      <UButton
        type="submit"
        form="forms-link"
        loading-auto
        :disabled="loading"
        :label="shared ? t('forms.screens.settings.save') : t(place ? 'forms.screens.slot.attach' : 'forms.screens.link.share')"
      />
    </template>
  </UModal>
</template>
