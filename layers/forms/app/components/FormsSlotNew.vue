<!-- Start a new form, or a new set of custom fields, for a slot (FB-510): a name and what to start
     from. The templates that suit the slot come first and the first of them is chosen; then a blank
     form and the other templates of the same kind. The form opens in the builder. -->
<script setup lang="ts">
interface Template { key: string, name: string, description: string | null, own: boolean, anonymous: boolean, questions: number, mode: 'submission' | 'record' | null, slots: string[] }

const props = defineProps<{
  slotId: string
  /** The slot's label (a translation key): the new form's name to begin with. */
  slotLabel: string
  mode: 'submission' | 'record'
}>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()

const BLANK = '-'
const state = reactive({ title: '', template: BLANK })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const templates = ref<Template[]>([])
const fields = computed(() => props.mode === 'record')
const fits = (tpl: Template) => tpl.mode === null || tpl.mode === props.mode
const suited = computed(() => templates.value.filter(tpl => fits(tpl) && tpl.slots.includes(props.slotId)))
const others = computed(() => templates.value.filter(tpl => fits(tpl) && !tpl.slots.includes(props.slotId)))
const nameOf = (tpl: Template) => tpl.own ? tpl.name : t(tpl.name)
const item = (tpl: Template) => ({ value: tpl.key, label: nameOf(tpl) })
const startItems = computed(() => [
  ...(suited.value.length ? [[{ type: 'label' as const, label: t('forms.screens.templates.suited') }, ...suited.value.map(item)]] : []),
  [{ value: BLANK, label: t(fields.value ? 'forms.screens.templates.blank-fields' : 'forms.screens.templates.blank') }, ...others.value.map(item)],
])
const chosen = computed(() => templates.value.find(tpl => tpl.key === state.template))
const chosenHelp = computed(() => {
  const tpl = chosen.value
  if (!tpl) return t(fields.value ? 'forms.screens.templates.blank-fields-help' : 'forms.screens.templates.blank-help')
  const about = tpl.own ? tpl.description : t(tpl.description ?? '')
  return [about, t('forms.screens.templates.questions', { count: tpl.questions }), tpl.anonymous ? t('forms.screens.templates.anonymous') : ''].filter(Boolean).join(' ')
})

watch(open, async (now) => {
  if (!now) return
  Object.assign(state, { title: t(props.slotLabel), template: BLANK })
  refusal.value = null
  try {
    templates.value = (await $api<{ templates: Template[] }>('/api/forms/templates')).templates
  }
  catch {
    templates.value = [] // a blank form can still be started
  }
  state.template = suited.value[0]?.key ?? BLANK
}, { immediate: true })

async function create() {
  refusal.value = null
  try {
    const made = await $api<{ formId: string }>('/api/forms/forms', { method: 'POST', body: { title: state.title, mode: props.mode, ...(state.template !== BLANK ? { template: state.template } : {}) } })
    open.value = false
    await navigateTo(`/console/forms/${made.formId}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t(fields ? 'forms.screens.fields.new' : 'forms.screens.slot.new')"
    :description="t(fields ? 'forms.screens.fields.new-help' : 'forms.screens.slot.new-help')"
  >
    <template #body>
      <UForm
        id="forms-slot-new"
        :state="state"
        :validate="() => needs({ title: state.title })"
        class="space-y-4"
        novalidate
        @submit="create"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="title"
          :label="t('forms.screens.settings.name')"
          :help="t('forms.screens.list.name-help')"
          required
        >
          <UInput
            v-model="state.title"
            maxlength="120"
            autofocus
          />
        </UFormField>
        <UFormField
          name="template"
          :label="t('forms.screens.templates.start-from')"
          :help="chosenHelp"
        >
          <USelect
            v-model="state.template"
            :items="startItems"
            class="min-w-64"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="forms-slot-new"
        loading-auto
        :label="t(fields ? 'forms.screens.fields.create' : 'forms.screens.list.create')"
      />
    </template>
  </UModal>
</template>
