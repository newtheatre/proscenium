<!-- The builder once its form has loaded. See pages/console/forms/[id].vue. -->
<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { find } from '../../shared/builder/edit'
import { FORM_BUILDER, useFormBuilder, type BuilderData } from '../composables/useFormBuilder'
import { questionsOf, type Answers } from '../../shared/engine'

const props = defineProps<{ data: BuilderData }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useT()
const toast = useToast()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const builder = useFormBuilder(props.data, () => props.data.fields)
provide(FORM_BUILDER, builder)
const form = computed(() => props.data.form)

const view = ref<'build' | 'preview'>('build')
const width = ref<'phone' | 'desktop'>('desktop')
const answers = ref<Answers>({})
const fill = useTemplateRef<{ restart: () => void }>('fill')
const publishing = ref(false)
const json = ref(false)
const settings = ref(false)
const sharing = ref(false)
const stages = ref(false)
const templating = ref(false)

// Beside the canvas on a laptop; a panel that slides over it on anything narrower.
const wide = useMediaQuery('(min-width: 1280px)')
const mounted = ref(false)
onMounted(() => { mounted.value = true })
const panel = computed({ get: () => !wide.value && builder.selected.value !== null, set: (open: boolean) => { if (!open) builder.selected.value = null } })
const selectedName = computed(() => {
  const found = builder.selected.value ? find(builder.definition.value, builder.selected.value) : null
  if (builder.selected.value === FORMS_START || builder.selected.value === FORMS_END) return t(builder.selected.value === FORMS_START ? 'forms.screens.ends.start' : 'forms.screens.ends.end')
  if (!found && builder.definition.value.calculations?.some(c => c.id === builder.selected.value)) return t('forms.screens.calculations.one')
  if (!found) return t(builder.selected.value ? 'forms.screens.endings.one' : 'forms.screens.details.title')
  if (found.kind === 'page') return t('forms.screens.details.kind-page')
  return t(`forms.screens.details.kind-${found.item.kind}`)
})

// What stops publishing that is not in the definition: a form that asks for personal answers must say how long it keeps them.
const PERSONAL = ['personal', 'free-text', 'special']
const problems = computed<{ level: 'error' | 'warning', code: string, at: string, params?: Record<string, string> }[]>(() => {
  const needs = !fields.value && props.data.requireRetention && form.value.retentionDays === null
    && questionsOf(builder.definition.value).some(q => PERSONAL.includes(q.question.dataClass))
  return [...(needs ? [{ level: 'error' as const, code: 'retention-needed', at: 'settings' }] : []), ...builder.problems.value]
})
const errors = computed(() => problems.value.filter(p => p.level === 'error').length)
const problemName = (at: string) => at === 'settings' ? t('forms.screens.settings.title') : formsProblemName(builder.definition.value, at, t)
function goTo(at: string) {
  if (at === 'settings') return void (settings.value = true)
  view.value = 'build'
  if (at.startsWith('stage:') || at.startsWith('move:')) return void (stages.value = true)
  builder.select(at)
}

defineShortcuts({ meta_z: () => builder.undo(), meta_shift_z: () => builder.redo() })
onBeforeRouteLeave(() => builder.flush())
function leaving(event: BeforeUnloadEvent) {
  if (builder.state.value === 'saved') return
  builder.flush()
  event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', leaving))
onBeforeUnmount(() => window.removeEventListener('beforeunload', leaving))

// Custom fields are filled in on their record: nobody is sent them, and they have no stages.
const fields = computed(() => form.value.mode === 'record')
// Published but offered to nobody yet, and whether the live version is taking answers at all.
const unshared = computed(() => !fields.value && form.value.liveVersion !== null && props.data.shared === false && form.value.status === 'live')
const taking = computed(() => fields.value || (form.value.status === 'live' && !unshared.value))
type Tone = 'neutral' | 'success' | 'info' | 'warning'
const badges = computed<{ tone: Tone, label: string }[]>(() => [
  form.value.liveVersion === null
    ? { tone: 'neutral', label: t('forms.screens.status.draft') }
    : { tone: taking.value ? 'success' : 'info', label: t(taking.value ? 'forms.screens.builder.version' : 'forms.screens.builder.version-only', { n: form.value.liveVersion }) },
  ...(unshared.value ? [{ tone: 'warning' as const, label: t('forms.screens.builder.not-shared') }] : []),
  ...(fields.value ? [{ tone: 'info' as const, label: t('forms.screens.fields.badge') }] : []),
  ...(form.value.status === 'archived' || (fields.value && form.value.status === 'closed') ? [{ tone: 'neutral' as const, label: t(`forms.screens.status.${form.value.status}`) }] : []),
])
const live = computed(() => !fields.value && form.value.liveVersion !== null)
// On a phone the Open control already says the form is live, so its version badge gives way.
const phoneBadges = computed(() => live.value && !unshared.value && form.value.status !== 'archived' ? badges.value.slice(1) : badges.value)
// From a tablet up sharing has a button of its own, so the menu leaves it out.
const roomy = useScreenQuery('(min-width: 768px)')
const more = computed(() => [[
  ...(fields.value || form.value.liveVersion === null || (roomy.value && live.value && !unshared.value) ? [] : [{ label: t('forms.screens.link.title'), icon: 'i-lucide-share-2', onSelect: () => { sharing.value = true } }]),
  { label: t('forms.screens.settings.title'), icon: 'i-lucide-settings-2', onSelect: () => { settings.value = true } },
  ...(fields.value ? [] : [{ label: t('forms.screens.stages.title'), icon: 'i-lucide-git-branch', onSelect: () => { stages.value = true } }]),
  { label: t('forms.screens.json.title'), icon: 'i-lucide-file-json', onSelect: () => { json.value = true } },
  ...(props.data.canSaveTemplate ? [{ label: t('forms.screens.templates.save'), icon: 'i-lucide-copy-plus', onSelect: () => { templating.value = true } }] : []),
], life.value].filter(group => group.length))

// ---- closing, opening again and archiving ----
type Status = 'draft' | 'live' | 'paused' | 'closed' | 'archived'
const undo = useUndo()
async function setStatus(to: Status, back?: Status) {
  try {
    await $api(`/api/forms/forms/${form.value.id}/status` as string, { method: 'POST', body: { to } })
    undo.offer(t(`forms.screens.life.done.${to}`), back ? async () => { await setStatus(back) } : undefined)
    emit('changed')
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
}
/** Archiving and restoring, from the menu. Opening and closing have a control of their own; each can be undone from its toast. */
const life = computed(() => {
  const status = form.value.status as Status
  const item = (key: string, icon: string, to: Status) => ({ label: t(`forms.screens.life.${key}`), icon, onSelect: () => { setStatus(to, status) } })
  if (status === 'closed') return [item('archive', 'i-lucide-archive', 'archived')]
  if (status === 'archived') return [item('restore', 'i-lucide-archive-restore', form.value.liveVersion === null ? 'draft' : 'closed')]
  // Custom fields have no open control, so closing them stays here.
  if (fields.value && status === 'live') return [item('close', 'i-lucide-circle-stop', 'closed')]
  return status === 'draft' ? [item('archive', 'i-lucide-archive', 'archived')] : []
})
function published(number: number, shared: boolean) {
  toast.add({ title: t(shared ? 'forms.screens.publish.done-shared' : 'forms.screens.publish.done', { n: number }), color: 'success' })
  emit('changed')
  // A form shared as it is first published has its address shown to copy.
  if (shared) sharing.value = true
  if (fields.value) toast.add({ title: t('forms.screens.fields.published'), color: 'info' })
}
const saveWords = computed(() => t(`forms.screens.save.${builder.state.value}`))
const reload = () => window.location.reload()
</script>

<template>
  <PageFrame
    :title="form.title"
    width="full"
    :trail="[{ label: t('forms.navigation.forms.label'), to: '/console/forms' }]"
  >
    <template #status>
      <span class="hidden items-center gap-1.5 sm:contents">
        <StatusBadge
          v-for="b in badges"
          :key="b.label"
          :tone="b.tone"
          :label="b.label"
        />
      </span>
    </template>
    <template #primary>
      <UButton
        v-if="unshared"
        class="hidden sm:inline-flex"
        :label="t('forms.screens.link.share')"
        icon="i-lucide-share-2"
        color="neutral"
        variant="outline"
        @click="sharing = true"
      />
      <UButton
        :label="t('forms.screens.publish.button')"
        icon="i-lucide-send"
        @click="publishing = true"
      />
    </template>
    <template #toolbar>
      <div class="flex min-w-0 flex-1 flex-col gap-1 py-1">
        <FormsTabs
          :form-id="form.id"
          current="build"
          :responses="live && !!data.canRead"
          :history="form.liveVersion !== null"
        />
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <UFieldGroup>
            <UButton
              v-for="v in (['build', 'preview'] as const)"
              :key="v"
              :label="t(`forms.screens.builder.view-${v}`)"
              :icon="v === 'build' ? 'i-lucide-pencil' : 'i-lucide-eye'"
              color="neutral"
              :variant="view === v ? 'solid' : 'outline'"
              :aria-pressed="view === v"
              @click="view = v"
            />
          </UFieldGroup>
          <IconButton
            icon="i-lucide-undo-2"
            :label="t('forms.screens.builder.undo')"
            :disabled="!builder.canUndo.value"
            @click="builder.undo()"
          />
          <IconButton
            icon="i-lucide-redo-2"
            :label="t('forms.screens.builder.redo')"
            :disabled="!builder.canRedo.value"
            @click="builder.redo()"
          />
          <UPopover :ui="{ content: 'w-96 max-w-[90vw]' }">
            <UButton
              :label="t('forms.screens.problems.button', { count: problems.length })"
              :icon="errors ? 'i-lucide-circle-alert' : problems.length ? 'i-lucide-triangle-alert' : 'i-lucide-circle-check'"
              :color="errors ? 'error' : problems.length ? 'warning' : 'neutral'"
              variant="subtle"
            />
            <template #content>
              <div class="max-h-96 overflow-y-auto p-2">
                <p
                  v-if="!problems.length"
                  class="p-2 text-sm text-muted"
                >
                  {{ t('forms.screens.problems.none') }}
                </p>
                <p
                  v-else
                  class="px-2 pb-1 pt-2 text-xs text-muted"
                >
                  {{ t('forms.screens.problems.help') }}
                </p>
                <button
                  v-for="(p, i) in problems"
                  :key="i"
                  type="button"
                  class="flex w-full items-start gap-2 rounded-md p-2 text-left text-sm hover:bg-elevated"
                  @click="goTo(p.at)"
                >
                  <UIcon
                    :name="p.level === 'error' ? 'i-lucide-circle-alert' : 'i-lucide-triangle-alert'"
                    class="mt-0.5 shrink-0"
                    :class="p.level === 'error' ? 'text-error' : 'text-warning'"
                  />
                  <span><span class="font-medium">{{ problemName(p.at) }}</span><br>{{ formsProblemWords(builder.definition.value, p, t) }}</span>
                </button>
              </div>
            </template>
          </UPopover>
          <!-- On a phone the badges sit here, so the header keeps room for the form's name. -->
          <span class="flex flex-wrap items-center gap-1.5 sm:hidden">
            <StatusBadge
              v-for="b in phoneBadges"
              :key="b.label"
              :tone="b.tone"
              :label="b.label"
            />
          </span>
          <span
            class="ms-auto flex items-center gap-1.5 text-sm text-muted"
            aria-live="polite"
          >
            <UIcon
              :name="builder.state.value === 'saved' ? 'i-lucide-cloud-check' : builder.state.value === 'stale' || builder.state.value === 'failed' ? 'i-lucide-cloud-alert' : 'i-lucide-cloud-upload'"
              :class="builder.state.value === 'stale' || builder.state.value === 'failed' ? 'text-error' : ''"
            />
            <span class="max-sm:sr-only">{{ saveWords }}</span>
          </span>
          <UButton
            v-if="live && !unshared"
            class="hidden md:inline-flex"
            :label="t('forms.screens.link.title')"
            icon="i-lucide-share-2"
            color="neutral"
            variant="outline"
            @click="sharing = true"
          />
          <FormsOpenControl
            v-if="live && !unshared && form.status !== 'archived'"
            :form-id="form.id"
            :status="form.status"
            @set="setStatus($event, form.status === 'live' ? 'live' : 'closed')"
            @saved="emit('changed')"
          />
          <UDropdownMenu :items="more">
            <IconButton
              icon="i-lucide-ellipsis"
              :label="t('forms.screens.builder.more')"
            />
          </UDropdownMenu>
        </div>
      </div>
    </template>

    <UAlert
      v-if="builder.state.value === 'stale' || builder.state.value === 'failed'"
      class="mb-4"
      color="error"
      variant="subtle"
      icon="i-lucide-cloud-alert"
      :title="t(`forms.screens.save.${builder.state.value}-title`)"
      :description="builder.failure.value ?? undefined"
      :actions="builder.state.value === 'stale' ? [{ label: t('forms.screens.save.reload'), color: 'neutral', variant: 'outline', onClick: reload }] : [{ label: t('forms.screens.save.retry'), color: 'neutral', variant: 'outline', onClick: () => builder.flush() }]"
    />

    <div
      v-show="view === 'build'"
      class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <FormsBuilderCanvas />
      <aside
        class="hidden xl:block xl:sticky xl:top-0 xl:max-h-[calc(100vh-10rem)] xl:self-start xl:overflow-y-auto xl:rounded-lg xl:border xl:border-default xl:bg-default xl:p-4"
        :aria-label="t('forms.screens.details.title')"
      >
        <p class="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
          {{ selectedName }}
        </p>
        <FormsBuilderDetails />
      </aside>
      <USlideover
        v-if="mounted && !wide"
        v-model:open="panel"
        :title="selectedName"
      >
        <template #body>
          <FormsBuilderDetails />
        </template>
      </USlideover>
    </div>

    <div
      v-if="view === 'preview'"
      class="space-y-4"
    >
      <div class="flex flex-wrap items-center justify-center gap-2">
        <UFieldGroup>
          <UButton
            v-for="w in (['phone', 'desktop'] as const)"
            :key="w"
            :label="t(`forms.screens.preview.${w}`)"
            :icon="w === 'phone' ? 'i-lucide-smartphone' : 'i-lucide-monitor'"
            size="sm"
            color="neutral"
            :variant="width === w ? 'solid' : 'outline'"
            :aria-pressed="width === w"
            @click="width = w"
          />
        </UFieldGroup>
        <UButton
          :label="t('forms.screens.preview.restart')"
          icon="i-lucide-rotate-ccw"
          size="sm"
          color="neutral"
          variant="ghost"
          @click="fill?.restart()"
        />
      </div>
      <p class="text-center text-sm text-muted">
        {{ t('forms.screens.preview.help') }}
      </p>
      <div
        class="@container mx-auto rounded-xl border border-default bg-default p-6 shadow-sm"
        :class="width === 'phone' ? 'max-w-sm' : 'max-w-2xl'"
      >
        <FormsFill
          ref="fill"
          v-model="answers"
          :definition="builder.definition.value"
          :context="{ today: data.today ?? '2000-01-01' }"
        >
          <template #ended>
            <UButton
              class="mt-2"
              :label="t('forms.screens.preview.restart')"
              icon="i-lucide-rotate-ccw"
              color="neutral"
              variant="subtle"
              @click="fill?.restart()"
            />
          </template>
        </FormsFill>
      </div>
    </div>

    <FormsPublishDialog
      v-model:open="publishing"
      :form-id="form.id"
      :first="form.liveVersion === null && !fields"
      @published="published"
      @settings="settings = true"
      @go="goTo"
    />
    <FormsJsonDialog
      v-model:open="json"
      :form-id="form.id"
      :slug="form.slug"
    />
    <FormsTemplateDialog
      v-model:open="templating"
      :form-id="form.id"
      :title="form.title"
    />
    <FormsLinkDialog
      v-model:open="sharing"
      :form-id="form.id"
      :anonymous="form.anonymous"
      @saved="emit('changed')"
    />
    <FormsStagesDialog
      v-model:open="stages"
      :reviewers="data.reviewers"
    />
    <FormsSettingsDialog
      v-model:open="settings"
      :form="form"
      @saved="emit('changed')"
    />
  </PageFrame>
</template>
