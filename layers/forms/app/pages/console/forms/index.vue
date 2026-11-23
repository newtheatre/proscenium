<!-- Forms (FB-201, FB-208): the forms this person may build, and New form: blank, from a template
     (forms', another module's or the theatre's own), or from an exported file. -->
<script setup lang="ts">
interface Template { key: string, name: string, description: string | null, own: boolean, anonymous: boolean, questions: number, mode: 'submission' | 'record' | null }
interface FormRow { canEdit?: boolean, canRead?: boolean, id: string, slug: string, title: string, status: 'draft' | 'live' | 'paused' | 'closed' | 'archived', published: boolean, mode: 'submission' | 'record', responses: number | null }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { data, status, error, refresh } = await useAPI<{ forms: FormRow[] }>('/api/forms/forms', { key: 'forms:forms' })

const open = ref(false)
const BLANK = '-'
const state = reactive({ title: '', file: '', fileName: '', template: BLANK })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const picker = useTemplateRef<HTMLInputElement>('picker')
// ---- templates: asked for when the dialog opens, so the list is as it stands now ----
const templates = ref<Template[]>([])
const canManage = ref(false)
const undo = useUndo()
const nameOf = (tpl: Template) => tpl.own ? tpl.name : t(tpl.name)
const startItems = computed(() => [
  { value: BLANK, label: t('forms.screens.templates.blank') },
  ...templates.value.map(tpl => ({ value: tpl.key, label: nameOf(tpl) })),
])
const chosen = computed(() => templates.value.find(tpl => tpl.key === state.template))
const chosenHelp = computed(() => {
  const tpl = chosen.value
  if (!tpl) return t('forms.screens.templates.blank-help')
  const about = tpl.own ? tpl.description : t(tpl.description ?? '')
  return [about, t('forms.screens.templates.questions', { count: tpl.questions }), tpl.anonymous ? t('forms.screens.templates.anonymous') : '', tpl.mode === 'record' ? t('forms.screens.templates.record') : ''].filter(Boolean).join(' ')
})
async function loadTemplates() {
  try {
    const got = await $api<{ templates: Template[], canManage: boolean }>('/api/forms/templates')
    templates.value = got.templates
    canManage.value = got.canManage
  }
  catch { /* a blank form can still be started */ }
}
async function removeTemplate(tpl: Template) {
  refusal.value = null
  try {
    const { removed } = await $api<{ removed: Record<string, unknown> }>(`/api/forms/templates/${tpl.key}` as string, { method: 'DELETE', body: {} })
    state.template = BLANK
    await loadTemplates()
    undo.offer(t('forms.screens.templates.removed', { name: tpl.name }), async () => {
      await $api('/api/forms/templates', { method: 'POST', body: removed })
      await loadTemplates()
    })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
function start() {
  Object.assign(state, { title: '', file: '', fileName: '', template: BLANK })
  refusal.value = null
  open.value = true
  loadTemplates()
}
async function load(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  state.file = await file.text()
  state.fileName = file.name
  try {
    const parsed = JSON.parse(state.file) as { title?: unknown }
    if (!state.title.trim() && typeof parsed.title === 'string') state.title = parsed.title
  }
  catch { /* said when the form is created */ }
}
async function create() {
  refusal.value = null
  let definition: unknown
  if (state.file) {
    try {
      const parsed = JSON.parse(state.file) as Record<string, unknown>
      definition = parsed.file === 'proscenium.form' ? parsed.definition : parsed
    }
    catch {
      refusal.value = { status: 422, code: 'forms.definition.invalid', reason: t('forms.screens.json.not-json') } // not-policy: the status of an invalid request
      return
    }
  }
  try {
    const made = await $api<{ formId: string }>('/api/forms/forms', { method: 'POST', body: { title: state.title, ...(definition !== undefined ? { definition } : state.template !== BLANK ? { template: state.template } : {}) } })
    open.value = false
    await navigateTo(`/console/forms/${made.formId}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const search = ref('')
const matching = computed(() => {
  const words = search.value.trim().toLowerCase()
  return (data.value?.forms ?? []).filter(f => !words || f.title.toLowerCase().includes(words) || f.slug.includes(words))
})
// A form that has been published opens on its responses, which is what people come back for; a draft opens to be built.
const where = (f: FormRow) => f.canRead && (!f.canEdit || (f.mode !== 'record' && f.published)) ? `/console/forms/${f.id}/responses` : `/console/forms/${f.id}`
const current = computed(() => matching.value.filter(f => f.status !== 'archived'))
const archived = computed(() => matching.value.filter(f => f.status === 'archived'))
// A set of custom fields is filled in on its record: it has no address, and nobody is sent it.
const about = (f: FormRow) => [
  f.mode === 'record' ? t('forms.screens.list.fields') : `/${f.slug}`,
  f.mode !== 'record' && f.responses !== null && f.published ? t('forms.screens.responses.count', { count: f.responses }) : '',
].filter(Boolean).join(' · ')
const badge = (f: FormRow) => f.mode === 'record' && f.status === 'live' ? t('forms.screens.list.in-use') : t(`forms.screens.status.${f.status}`)
// The template's name is offered as the form's, until the person writes their own.
let offered = ''
watch(() => state.template, () => {
  if (state.title.trim() && state.title !== offered) return
  offered = chosen.value ? nameOf(chosen.value) : ''
  state.title = offered
})
const tone = { draft: 'neutral', live: 'success', paused: 'neutral', closed: 'neutral', archived: 'neutral' } as const
</script>

<template>
  <PageFrame
    :title="t('forms.navigation.forms.label')"
    :description="t('forms.screens.list.help')"
  >
    <template #primary>
      <SearchToggle
        v-if="(data?.forms.length ?? 0) > 5"
        v-model="search"
        :label="t('forms.screens.list.search')"
      />
      <UButton
        :label="t('forms.screens.list.new')"
        icon="i-lucide-plus"
        @click="start"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.forms.length"
        icon="i-lucide-file-text"
        :title="t('forms.screens.list.empty')"
        :description="t('forms.screens.list.empty-help')"
      >
        <template #actions>
          <UButton
            :label="t('forms.screens.list.new')"
            icon="i-lucide-plus"
            @click="start"
          />
        </template>
      </EmptyState>
      <EmptyState
        v-else-if="!matching.length"
        icon="i-lucide-search"
        :title="t('forms.screens.list.none-match')"
      />
      <RecordList
        v-else
        :label="t('forms.navigation.forms.label')"
      >
        <RecordListItem
          v-for="f in current"
          :key="f.id"
          :to="where(f)"
          :icon="f.mode === 'record' ? 'i-lucide-list-plus' : 'i-lucide-file-text'"
          :name="f.title"
          :description="about(f)"
        >
          <StatusBadge
            :tone="tone[f.status]"
            :label="badge(f)"
          />
        </RecordListItem>
      </RecordList>
      <CollapsibleDivider
        v-if="archived.length"
        :label="t('forms.screens.list.archived')"
        :count="archived.length"
      >
        <RecordList :label="t('forms.screens.list.archived')">
          <RecordListItem
            v-for="f in archived"
            :key="f.id"
            :to="where(f)"
            :icon="f.mode === 'record' ? 'i-lucide-list-plus' : 'i-lucide-file-text'"
            :name="f.title"
            :description="about(f)"
            muted
          />
        </RecordList>
      </CollapsibleDivider>
    </DataBoundary>

    <UModal
      v-model:open="open"
      :title="t('forms.screens.list.new')"
    >
      <template #body>
        <UForm
          id="forms-new"
          :state="state"
          :validate="() => needs({ title: state.title })"
          class="space-y-4"
          novalidate
          @submit="create"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            v-if="!state.fileName"
            name="template"
            :label="t('forms.screens.templates.start-from')"
            :help="chosenHelp"
          >
            <div class="flex items-center gap-2">
              <USelect
                v-model="state.template"
                :items="startItems"
                class="min-w-64"
              />
              <IconButton
                v-if="chosen?.own && canManage"
                icon="i-lucide-trash-2"
                size="sm"
                :label="t('forms.screens.templates.remove', { name: chosen.name })"
                @click="removeTemplate(chosen)"
              />
            </div>
          </UFormField>
          <UFormField
            v-else
            :label="t('forms.screens.list.from-file')"
          >
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-file-json"
                class="shrink-0 text-muted"
              />
              <span class="min-w-0 truncate text-sm">{{ state.fileName }}</span>
              <IconButton
                icon="i-lucide-x"
                size="sm"
                :label="t('forms.screens.list.clear-file')"
                @click="Object.assign(state, { file: '', fileName: '' })"
              />
            </div>
          </UFormField>
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
          <p
            v-if="!state.fileName"
            class="flex flex-wrap items-center gap-x-2 text-sm text-muted"
          >
            <UButton
              :label="t('forms.screens.list.from-file')"
              icon="i-lucide-folder-open"
              color="neutral"
              variant="link"
              class="px-0"
              @click="picker?.click()"
            />
            <span>{{ t('forms.screens.list.from-file-help') }}</span>
          </p>
          <input
            ref="picker"
            type="file"
            accept=".json,application/json"
            class="hidden"
            @change="load"
          >
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="forms-new"
          loading-auto
          :label="t('forms.screens.list.create')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
