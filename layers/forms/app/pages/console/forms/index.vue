<!-- Forms (FB-201): the forms this person may build, and New form, blank or from an exported file. -->
<script setup lang="ts">
interface FormRow { id: string, slug: string, title: string, status: 'draft' | 'live' | 'paused' | 'closed' | 'archived', published: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { data, status, error, refresh } = await useAPI<{ forms: FormRow[] }>('/api/forms/forms', { key: 'forms:forms' })

const open = ref(false)
const state = reactive({ title: '', file: '', fileName: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const picker = useTemplateRef<HTMLInputElement>('picker')
function start() {
  Object.assign(state, { title: '', file: '', fileName: '' })
  refusal.value = null
  open.value = true
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
    const made = await $api<{ formId: string }>('/api/forms/forms', { method: 'POST', body: { title: state.title, ...(definition === undefined ? {} : { definition }) } })
    open.value = false
    await navigateTo(`/console/forms/${made.formId}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const current = computed(() => (data.value?.forms ?? []).filter(f => f.status !== 'archived'))
const archived = computed(() => (data.value?.forms ?? []).filter(f => f.status === 'archived'))
const tone = { draft: 'neutral', live: 'success', paused: 'warning', closed: 'neutral', archived: 'neutral' } as const
</script>

<template>
  <PageFrame
    :title="t('forms.navigation.forms.label')"
    :description="t('forms.screens.list.help')"
  >
    <template #primary>
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
      />
      <RecordList
        v-else
        :label="t('forms.navigation.forms.label')"
      >
        <RecordListItem
          v-for="f in current"
          :key="f.id"
          :to="`/console/forms/${f.id}`"
          icon="i-lucide-file-text"
          :name="f.title"
          :description="`/${f.slug}`"
        >
          <StatusBadge
            :tone="tone[f.status]"
            :label="t(`forms.screens.status.${f.status}`)"
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
            :to="`/console/forms/${f.id}`"
            icon="i-lucide-file-text"
            :name="f.title"
            :description="`/${f.slug}`"
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
            :label="t('forms.screens.list.from-file')"
            :help="t('forms.screens.list.from-file-help')"
            :hint="t('forms.screens.details.optional')"
          >
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                :label="t('forms.screens.json.open-file')"
                icon="i-lucide-folder-open"
                color="neutral"
                variant="subtle"
                @click="picker?.click()"
              />
              <span
                v-if="state.fileName"
                class="text-sm text-muted"
              >{{ state.fileName }}</span>
              <IconButton
                v-if="state.fileName"
                icon="i-lucide-x"
                size="sm"
                :label="t('forms.screens.list.clear-file')"
                @click="Object.assign(state, { file: '', fileName: '' })"
              />
            </div>
            <input
              ref="picker"
              type="file"
              accept=".json,application/json"
              class="hidden"
              @change="load"
            >
          </UFormField>
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
