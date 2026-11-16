<!-- The Settings page type (UI-14): generated from the settings registry, so a module writes no
     settings screen. Each setting shows its value, its default with a Reset link once changed,
     who may change it, and a "Quoted on public pages" tag where a content page shows it live.
     Changes save per section with a stated summary. A setting the viewer may read but not change
     is shown read-only with who can change it. -->
<script setup lang="ts">
import { fromControl, sameValue, toControl } from '../../shared/controls'

interface SettingView {
  key: string
  group: string
  name: string
  kind: string
  labelKey: string
  helpKey: string
  unitKey?: string
  value: unknown
  default: unknown
  overridden: boolean
  unset: boolean
  sensitive: boolean
  managed: boolean
  quotable: boolean
  changeLabelKey: string
  canChange: boolean
  min?: number | string
  max?: number | string
  maxLength?: number
  options?: string[]
  of?: string
}

const { $api } = useNuxtApp()
const props = defineProps<{
  /** The module whose settings these are. */
  module: string
  title: string
  /** A setting to scroll into view and highlight, from settings search. */
  highlight?: string
}>()

const { t } = useT()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ module: string, settings: SettingView[] }>('/api/core/settings', { query: { module: props.module }, key: `core:settings:${props.module}` })

const draft = reactive<Record<string, any>>({})
const resets = reactive<Record<string, boolean>>({})
const problems = reactive<Record<string, string>>({})
const saving = ref<string | null>(null)

function load() {
  for (const s of data.value?.settings ?? []) {
    draft[s.key] = s.sensitive ? '' : toControl(s)
    resets[s.key] = false
  }
}
watch(data, load, { immediate: true })

const sections = computed(() => {
  const groups = new Map<string, SettingView[]>()
  for (const s of data.value?.settings ?? []) groups.set(s.group, [...(groups.get(s.group) ?? []), s])
  return [...groups].map(([id, settings]) => ({ id, settings }))
})

const changed = (s: SettingView) => s.canChange && (resets[s.key] || (s.sensitive ? draft[s.key] !== '' : !sameValue(draft[s.key], toControl(s))))
const changesIn = (settings: SettingView[]) => settings.filter(changed)

function resetToDefault(s: SettingView) {
  draft[s.key] = toControl(s, s.default)
  resets[s.key] = true
}
function onEdit(s: SettingView, value: unknown) {
  draft[s.key] = value
  resets[s.key] = false
  Reflect.deleteProperty(problems, s.key)
}

async function save(sectionId: string, settings: SettingView[]) {
  const changes = changesIn(settings).map(s => resets[s.key]
    ? { key: s.key, reset: true }
    : { key: s.key, value: fromControl(s.kind, draft[s.key], s.unset) })
  if (!changes.length || saving.value) return
  saving.value = sectionId
  for (const s of settings) Reflect.deleteProperty(problems, s.key)
  try {
    await $api('/api/core/settings', { method: 'PUT', body: { changes } })
    toast.add({ title: t('core.settings-page.saved', { count: changes.length }), color: 'success', icon: 'i-lucide-circle-check' })
    await refresh()
  }
  catch (e) {
    const failure = toRefusal(e)
    const keys = settings.map(s => s.key)
    const fieldKey = Object.keys(failure.fields ?? {}).find(k => keys.includes(k))
    const target = fieldKey ?? changes[0]!.key
    problems[target] = phrase(failure.fields?.[target] ?? failure.fields?.value) ?? failure.reason
  }
  finally {
    saving.value = null
  }
}

/** A numeric limit as the control shows it: money is typed in pounds, stored in pence. */
function limit(s: SettingView, which: 'min' | 'max'): number | undefined {
  const value = s[which]
  if (typeof value !== 'number') return undefined
  return s.kind === 'money' ? value / 100 : value // not-policy: pence to pounds
}

const unitText = (s: SettingView) => s.unitKey ? t(s.unitKey) : undefined
const optionItems = (s: SettingView) => (s.options ?? []).map(o => ({ value: o, label: t(`${props.module}.settings.${s.group}.${s.name}.options.${o}`) }))
const defaultText = (s: SettingView) => {
  const v = toControl(s, s.default)
  return s.kind === 'boolean' ? (v ? t('core.settings-page.on') : t('core.settings-page.off')) : String(Array.isArray(v) ? v.join(', ') : v)
}

onMounted(() => {
  if (props.highlight) document.getElementById(`setting-${props.highlight}`)?.scrollIntoView({ block: 'center' })
})
</script>

<template>
  <PageFrame
    :title="title"
    width="reading"
  >
    <SettingsSearch />
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <form
        v-for="section in sections"
        :key="section.id"
        @submit.prevent="save(section.id, section.settings)"
      >
        <PageSection :title="t(`${module}.settings-sections.${section.id}`)">
          <div class="divide-y divide-default">
            <div
              v-for="s in section.settings"
              :id="`setting-${s.key}`"
              :key="s.key"
              class="space-y-2 py-4 first:pt-0 last:pb-0"
              :class="highlight === s.key ? 'bg-primary/10' : ''"
            >
              <UFormField
                :label="t(s.labelKey)"
                :help="t(s.helpKey)"
                :error="problems[s.key]"
                :name="s.key"
              >
                <USwitch
                  v-if="s.kind === 'boolean'"
                  :model-value="draft[s.key]"
                  :disabled="!s.canChange"
                  @update:model-value="onEdit(s, $event)"
                />
                <UInputNumber
                  v-else-if="s.kind === 'integer' || s.kind === 'money'"
                  :model-value="draft[s.key]"
                  :disabled="!s.canChange"
                  :min="limit(s, 'min')"
                  :max="limit(s, 'max')"
                  :format-options="s.kind === 'money' ? { style: 'currency', currency: 'GBP' } : undefined"
                  class="w-48"
                  @update:model-value="onEdit(s, $event)"
                />
                <USelect
                  v-else-if="s.kind === 'choice'"
                  :model-value="draft[s.key]"
                  :items="optionItems(s)"
                  value-key="value"
                  :disabled="!s.canChange"
                  class="w-64"
                  @update:model-value="onEdit(s, $event)"
                />
                <UInputTags
                  v-else-if="s.kind === 'list'"
                  :model-value="draft[s.key]"
                  :disabled="!s.canChange"
                  @update:model-value="onEdit(s, $event)"
                />
                <UInput
                  v-else
                  :model-value="draft[s.key]"
                  :type="s.sensitive ? 'password' : s.kind === 'time' ? 'time' : 'text'"
                  :disabled="!s.canChange"
                  :maxlength="s.maxLength"
                  :placeholder="s.sensitive ? t('core.settings-page.hidden') : undefined"
                  class="max-w-md"
                  @update:model-value="onEdit(s, $event)"
                />
                <template
                  v-if="unitText(s)"
                  #hint
                >
                  {{ unitText(s) }}
                </template>
              </UFormField>

              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                <span v-if="s.overridden || resets[s.key]">
                  {{ t('core.settings-page.default', { value: defaultText(s) }) }}
                  <UButton
                    v-if="s.canChange && !resets[s.key]"
                    color="neutral"
                    variant="link"
                    size="sm"
                    :label="t('core.settings-page.reset')"
                    :aria-label="t('core.settings-page.reset-named', { setting: t(s.labelKey) })"
                    @click="resetToDefault(s)"
                  />
                </span>
                <UBadge
                  v-if="s.quotable"
                  color="neutral"
                  :label="t('core.settings-page.quoted')"
                />
                <span v-if="!s.canChange">
                  {{ s.managed ? t('core.settings-page.managed') : t('core.settings-page.read-only', { ability: t(s.changeLabelKey) }) }}
                </span>
                <span v-else>{{ t('core.settings-page.who', { ability: t(s.changeLabelKey) }) }}</span>
              </div>
            </div>
          </div>
          <template #footer>
            <p
              class="text-sm text-muted"
              aria-live="polite"
            >
              {{ changesIn(section.settings).length ? t('core.settings-page.changes', { count: changesIn(section.settings).length }) : t('core.settings-page.no-changes') }}
            </p>
            <UButton
              type="submit"
              :label="t('core.settings-page.save', { section: t(`${module}.settings-sections.${section.id}`) })"
              :loading="saving === section.id"
              :disabled="!changesIn(section.settings).length || saving !== null"
            />
          </template>
        </PageSection>
      </form>
    </DataBoundary>
  </PageFrame>
</template>
