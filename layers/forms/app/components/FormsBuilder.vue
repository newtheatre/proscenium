<!-- The builder once its form has loaded. See pages/console/forms/[id].vue. -->
<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { find } from '../../shared/builder/edit'
import { FORM_BUILDER, useFormBuilder, type BuilderData } from '../composables/useFormBuilder'
import type { Answers } from '../../shared/engine'

const props = defineProps<{ data: BuilderData }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useT()
const toast = useToast()
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

// Beside the canvas on a laptop; a panel that slides over it on anything narrower.
const wide = useMediaQuery('(min-width: 1280px)')
const mounted = ref(false)
onMounted(() => { mounted.value = true })
const panel = computed({ get: () => !wide.value && builder.selected.value !== null, set: (open: boolean) => { if (!open) builder.selected.value = null } })
const selectedName = computed(() => {
  const found = builder.selected.value ? find(builder.definition.value, builder.selected.value) : null
  if (!found) return t(builder.selected.value ? 'forms.screens.endings.one' : 'forms.screens.details.title')
  if (found.kind === 'page') return t('forms.screens.details.kind-page')
  return t(`forms.screens.details.kind-${found.item.kind}`)
})

const errors = computed(() => builder.problems.value.filter(p => p.level === 'error').length)
const problemName = (at: string) => {
  const flow = builder.definition.value.workflow
  if (at.startsWith('stage:')) return flow?.stages.find(s => s.key === at.slice(6))?.name.trim() || t('forms.screens.stages.a-stage') // not-policy: the length of "stage:"
  if (at.startsWith('move:')) return flow?.transitions.find(m => m.key === at.slice(5))?.label.trim() || t('forms.screens.stages.a-move') // not-policy: the length of "move:"
  const found = find(builder.definition.value, at)
  if (!found) return builder.definition.value.calculations?.find(c => c.id === at)?.key ?? at
  if (found.kind === 'page') return found.page.title.trim() || t('forms.screens.builder.page-n', { n: found.pageIndex + 1 })
  const item = found.item
  return item.kind === 'question' ? formsQuestionName(item) : item.kind === 'group' ? item.label.trim() || t('forms.screens.builder.untitled-group') : t(`forms.screens.details.kind-${item.kind}`)
}
function goTo(at: string) {
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

const more = computed(() => [[
  { label: t('forms.screens.link.title'), icon: 'i-lucide-share-2', onSelect: () => { sharing.value = true } },
  { label: t('forms.screens.responses.title'), icon: 'i-lucide-table-2', to: `/console/forms/${form.value.id}/responses` },
], [
  { label: t('forms.screens.settings.title'), icon: 'i-lucide-settings-2', onSelect: () => { settings.value = true } },
  { label: t('forms.screens.stages.title'), icon: 'i-lucide-git-branch', onSelect: () => { stages.value = true } },
  { label: t('forms.screens.json.title'), icon: 'i-lucide-braces', onSelect: () => { json.value = true } },
]])
function published(number: number) {
  toast.add({ title: t('forms.screens.publish.done', { n: number }), color: 'success' })
  emit('changed')
  // A form published for the first time is in front of nobody yet: offer to share it.
  if (form.value.liveVersion === null) sharing.value = true
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
      <StatusBadge
        :tone="form.liveVersion === null ? 'neutral' : 'success'"
        :label="form.liveVersion === null ? t('forms.screens.status.draft') : t('forms.screens.builder.version', { n: form.liveVersion })"
      />
    </template>
    <template #primary>
      <UButton
        :label="t('forms.screens.publish.button')"
        icon="i-lucide-send"
        @click="publishing = true"
      />
    </template>
    <template #toolbar>
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <UFieldGroup>
          <UButton
            v-for="v in (['build', 'preview'] as const)"
            :key="v"
            :label="t(`forms.screens.builder.view-${v}`)"
            :icon="v === 'build' ? 'i-lucide-pencil-ruler' : 'i-lucide-eye'"
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
            :label="t('forms.screens.problems.button', { count: builder.problems.value.length })"
            :icon="errors ? 'i-lucide-circle-alert' : builder.problems.value.length ? 'i-lucide-triangle-alert' : 'i-lucide-circle-check'"
            :color="errors ? 'error' : builder.problems.value.length ? 'warning' : 'neutral'"
            variant="subtle"
          />
          <template #content>
            <div class="max-h-96 overflow-y-auto p-2">
              <p
                v-if="!builder.problems.value.length"
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
                v-for="(p, i) in builder.problems.value"
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
                <span><span class="font-medium">{{ problemName(p.at) }}</span><br>{{ t(`forms.problems.${p.code}`, p.params ?? {}) }}</span>
              </button>
            </div>
          </template>
        </UPopover>
        <span
          class="ms-auto flex items-center gap-1.5 text-sm text-muted"
          aria-live="polite"
        >
          <UIcon
            :name="builder.state.value === 'saved' ? 'i-lucide-cloud-check' : builder.state.value === 'stale' || builder.state.value === 'failed' ? 'i-lucide-cloud-alert' : 'i-lucide-cloud-upload'"
            :class="builder.state.value === 'stale' || builder.state.value === 'failed' ? 'text-error' : ''"
          />
          {{ saveWords }}
        </span>
        <UDropdownMenu :items="more">
          <IconButton
            icon="i-lucide-ellipsis"
            :label="t('forms.screens.builder.more')"
          />
        </UDropdownMenu>
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
        class="hidden xl:block xl:sticky xl:top-4 xl:max-h-[calc(100vh-10rem)] xl:self-start xl:overflow-y-auto xl:rounded-lg xl:border xl:border-default xl:bg-default xl:p-4"
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
      @published="published"
      @settings="settings = true"
    />
    <FormsJsonDialog
      v-model:open="json"
      :form-id="form.id"
      :slug="form.slug"
    />
    <FormsLinkDialog
      v-model:open="sharing"
      :form-id="form.id"
      :anonymous="form.anonymous"
    />
    <FormsStagesDialog v-model:open="stages" />
    <FormsSettingsDialog
      v-model:open="settings"
      :form="form"
      @saved="emit('changed')"
    />
  </PageFrame>
</template>
