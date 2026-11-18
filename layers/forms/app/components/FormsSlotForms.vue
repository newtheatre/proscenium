<!-- The forms attached to one record in a slot (forms.slot): a module that declares a slot places
     this on its record's page. It lists what is attached, with the address people answer at and
     where the responses are, and lets somebody who may attach a published form or take one away, or
     start a new one, from a template that suits the slot when a module ships one.
     The props are part of forms' interface to other modules. -->
<script setup lang="ts">
interface Attached { anonymous: boolean, id: string, formId: string, title: string, address: string, responseCount: number, status: 'active' | 'paused', opensAt: number | null, closesAt: number | null, formStatus: string }
interface There { slot: { id: string, label: string, limit: number, mode: 'submission' | 'record' }, attached: Attached[], forms: { id: string, title: string, anonymous: boolean }[] }

const props = defineProps<{
  /** The slot's id, such as `awards.nomination`. */
  slotId: string
  /** The id of the record the forms are attached to. For a slot of custom fields, `*`: every record of the type. */
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
const fields = computed(() => data.value?.slot.mode === 'record')
// Custom fields have no terms: nobody is sent them, they are filled in on each record.
const ALWAYS = { audience: 'signed_in', opensAt: null, closesAt: null, responseCap: null, onePerPerson: false, status: 'active' }
async function attachFields(formId: string) {
  refusal.value = null
  try {
    await $api(`${at.value}/${formId}` as string, { method: 'PUT', body: ALWAYS })
    toast.add({ title: t('forms.screens.fields.attached'), color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  await saved()
}
// A new form or set of fields opens in the builder, from a template that suits the slot when there is one.
const starting = ref(false)
// Choosing a form opens its terms; it is attached when they are saved.
watch(adding, (id) => {
  const form = data.value?.forms.find(f => f.id === id)
  if (form && fields.value) attachFields(form.id)
  else if (form) terms(form.id, form.anonymous)
})
watch(open, (now) => {
  if (!now) adding.value = undefined
})
async function saved() {
  adding.value = undefined
  await refresh()
  await refreshFields()
}
/** Custom fields drawn on this page come from the same slot: what is attached has changed, so they are read again. */
async function refreshFields() {
  if (!fields.value) return
  const keys = Object.keys(useNuxtApp().payload.data).filter(k => k.startsWith(`forms:record:${props.slotId}:`))
  if (keys.length) await refreshNuxtData(keys)
}
// Somebody who may fill in fields but not attach them is shown nothing here, rather than a refusal.
const shut = computed(() => !!error.value && toRefusal(error.value).status === 403) // not-policy: HTTP status
async function detach(form: Attached) {
  refusal.value = null
  try {
    await $api(`${at.value}/${form.formId}` as string, { method: 'DELETE', body: {} })
    toast.add({ title: t(fields.value ? 'forms.screens.fields.detached' : 'forms.screens.slot.detached'), color: 'success' })
    await refresh()
    await refreshFields()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const state = (form: Attached) => form.formStatus !== 'live' || form.status === 'paused' ? 'paused' : form.closesAt !== null && form.closesAt <= Date.now() ? 'closed' : form.opensAt !== null && form.opensAt > Date.now() ? 'not-yet' : 'open'
</script>

<template>
  <div
    v-if="!shut"
    class="space-y-3"
  >
    <RefusalNotice :refusal="refusal ?? (error ? toRefusal(error) : null)" />
    <template v-if="data">
      <p
        v-if="!data.attached.length"
        class="text-sm text-muted"
      >
        {{ t(fields ? 'forms.screens.fields.none-attached' : 'forms.screens.slot.none') }}
      </p>
      <RecordList
        v-else
        :label="t(fields ? 'forms.screens.fields.attached-here' : 'forms.screens.slot.attached-here')"
      >
        <RecordListItem
          v-for="form in data.attached"
          :key="form.id"
          icon="i-lucide-file-text"
          :name="form.title"
          :description="fields ? undefined : form.address"
        >
          <StatusBadge
            v-if="!fields"
            :tone="state(form) === 'open' ? 'success' : state(form) === 'not-yet' ? 'info' : 'neutral'"
            :label="t(`forms.screens.slot.state.${state(form)}`)"
          />
          <UButton
            v-if="!fields"
            color="neutral"
            variant="link"
            :to="`/console/forms/${form.formId}/responses`"
            :label="t('forms.screens.link.responses', { count: form.responseCount })"
          />
          <div class="flex gap-2">
            <UButton
              v-if="fields"
              color="neutral"
              variant="outline"
              size="sm"
              :label="t('forms.screens.fields.edit')"
              :aria-label="t('forms.screens.fields.edit-n', { name: form.title })"
              :to="`/console/forms/${form.formId}`"
            />
            <UButton
              v-else
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
        v-if="room && (!fields || choices.length)"
        :label="t(fields ? 'forms.screens.fields.add' : 'forms.screens.slot.add')"
        :help="choices.length ? undefined : t('forms.screens.slot.nothing-published')"
      >
        <template
          v-if="!choices.length"
          #help
        >
          {{ t('forms.screens.slot.nothing-published') }}
          <ULink
            to="/console/forms"
            class="underline"
          >
            {{ t('forms.screens.slot.go-to-forms') }}
          </ULink>
        </template>
        <USelectMenu
          v-model="adding"
          value-key="value"
          :items="choices"
          :disabled="!choices.length"
          :placeholder="t(fields ? 'forms.screens.fields.choose' : 'forms.screens.slot.choose')"
          class="min-w-64"
        />
      </UFormField>
      <div
        v-if="room"
        class="space-y-1"
      >
        <UButton
          :label="t(fields ? 'forms.screens.fields.new' : 'forms.screens.slot.new')"
          icon="i-lucide-plus"
          color="neutral"
          variant="subtle"
          @click="starting = true"
        />
        <p class="text-sm text-muted">
          {{ t(fields ? 'forms.screens.fields.new-help' : 'forms.screens.slot.new-help') }}
        </p>
      </div>
    </template>
    <FormsSlotNew
      v-if="data"
      v-model:open="starting"
      :slot-id="slotId"
      :slot-label="data.slot.label"
      :mode="data.slot.mode"
    />
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
