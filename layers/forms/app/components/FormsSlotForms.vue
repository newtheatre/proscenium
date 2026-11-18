<!-- The forms attached to one record in a slot (forms.slot): a module that declares a slot places
     this on its record's page. It lists what is attached, with the address people answer at and
     where the responses are, and lets somebody who may attach a published form or take one away.
     The props are part of forms' interface to other modules. -->
<script setup lang="ts">
interface Attached { anonymous: boolean, id: string, formId: string, title: string, address: string, responseCount: number, status: 'active' | 'paused', opensAt: number | null, closesAt: number | null, formStatus: string }
interface There { slot: { id: string, label: string, limit: number }, attached: Attached[], forms: { id: string, title: string, anonymous: boolean }[] }

const props = defineProps<{
  /** The slot's id, such as `awards.nomination`. */
  slotId: string
  /** The id of the record the forms are attached to. */
  subject: string
}>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const at = computed(() => `/api/forms/slots/${encodeURIComponent(props.slotId)}/${encodeURIComponent(props.subject)}`)
const { data, refresh, error } = await useAPI<There>(() => at.value, { key: `forms:slot:${props.slotId}:${props.subject}` })

const adding = ref<string>()
const editing = ref<{ formId: string, anonymous: boolean }>()
const open = ref(false)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const choices = computed(() => (data.value?.forms ?? []).map(f => ({ value: f.id, label: f.title })))
const room = computed(() => !!data.value && data.value.attached.length < data.value.slot.limit)

function terms(formId: string, anonymous = false) {
  editing.value = { formId, anonymous }
  open.value = true
}
// Choosing a form opens its terms; it is attached when they are saved.
watch(adding, (id) => {
  const form = data.value?.forms.find(f => f.id === id)
  if (form) terms(form.id, form.anonymous)
})
watch(open, (now) => {
  if (!now) adding.value = undefined
})
async function saved() {
  adding.value = undefined
  await refresh()
}
async function detach(form: Attached) {
  refusal.value = null
  try {
    await $api(`${at.value}/${form.formId}` as string, { method: 'DELETE', body: {} })
    toast.add({ title: t('forms.screens.slot.detached'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const state = (form: Attached) => form.formStatus !== 'live' || form.status === 'paused' ? 'paused' : form.closesAt !== null && form.closesAt <= Date.now() ? 'closed' : form.opensAt !== null && form.opensAt > Date.now() ? 'not-yet' : 'open'
</script>

<template>
  <div class="space-y-3">
    <RefusalNotice :refusal="refusal ?? (error ? toRefusal(error) : null)" />
    <template v-if="data">
      <p
        v-if="!data.attached.length"
        class="text-sm text-muted"
      >
        {{ t('forms.screens.slot.none') }}
      </p>
      <RecordList
        v-else
        :label="t('forms.screens.slot.attached-here')"
      >
        <RecordListItem
          v-for="form in data.attached"
          :key="form.id"
          icon="i-lucide-file-text"
          :name="form.title"
          :description="form.address"
        >
          <StatusBadge
            :tone="state(form) === 'open' ? 'success' : state(form) === 'not-yet' ? 'info' : 'neutral'"
            :label="t(`forms.screens.slot.state.${state(form)}`)"
          />
          <UButton
            color="neutral"
            variant="link"
            :to="`/console/forms/${form.formId}/responses`"
            :label="t('forms.screens.link.responses', { count: form.responseCount })"
          />
          <div class="flex gap-2">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              :label="t('forms.screens.slot.change')"
              :aria-label="t('forms.screens.slot.change-n', { name: form.title })"
              @click="terms(form.formId, form.anonymous)"
            />
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              :label="t('forms.screens.slot.detach')"
              :aria-label="t('forms.screens.slot.detach-n', { name: form.title })"
              @click="detach(form)"
            />
          </div>
        </RecordListItem>
      </RecordList>
      <UFormField
        v-if="room"
        :label="t('forms.screens.slot.add')"
        :help="choices.length ? undefined : t('forms.screens.slot.nothing-published')"
      >
        <USelectMenu
          v-model="adding"
          value-key="value"
          :items="choices"
          :disabled="!choices.length"
          :placeholder="t('forms.screens.slot.choose')"
          class="min-w-64"
        />
      </UFormField>
    </template>
    <FormsLinkDialog
      v-if="editing"
      v-model:open="open"
      :form-id="editing.formId"
      :anonymous="editing.anonymous"
      :place="{ slot: slotId, subject }"
      @saved="saved"
    />
  </div>
</template>
