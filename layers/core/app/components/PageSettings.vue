<!-- The Settings page type (UI-14): generated from the settings registry, so a module writes no
     settings screen. Each setting shows its value, its default with a Reset link once changed,
     who may change it, and a "Quoted on public pages" tag where a content page shows it live.
     Changes save per section with a stated summary. A setting the viewer may read but not change
     is shown read-only with who can change it. -->
<script setup lang="ts">
import { parseTime } from '@internationalized/date'
import { controlText, fromControl, sameValue, toControl, type RateControl } from '../../shared/controls'
import { durationParts } from '../../kit/duration'

interface SettingView {
  key: string
  module: string
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
  /** 'confirm': the page shows what will change and asks again before saving. */
  onChange: 'reason' | 'confirm' | null
  changeLabelKey: string
  canChange: boolean
  /** The latest change, for "Changed by <name>, <date>". */
  lastChange?: { at: number, by: string | null } | null
  /** A value the server suggests while none is set (the address this page was loaded on). */
  suggestion?: string | null
  min?: number | string
  max?: number | string
  maxLength?: number
  options?: string[]
  of?: string
  /** reference only: the record type it names. */
  record?: string
}

const { $api } = useNuxtApp()
const props = defineProps<{
  /** The page of settings to draw, by id (`core.sign-in`, `core.advanced`, `gallery.settings`). */
  page: string
  title: string
  trail?: { label: string, to: string }[]
  /** A setting to scroll into view and highlight, from settings search. */
  highlight?: string
}>()

const { t } = useT()
const toast = useToast()
const { confirm } = useConfirm()
const { language, day: when } = useDates()
const { data: publicSettings } = usePublicSettings()
const currency = computed(() => (publicSettings.value?.['core.locale.currency']?.value as string | undefined) ?? 'GBP')
const { data, status, error, refresh } = await useAPI<{ page: { id: string, module: string } | null, settings: SettingView[] }>('/api/core/settings', {
  query: { page: props.page },
  key: `core:settings:page:${props.page}`,
})
const advanced = props.page === 'core.advanced'
const history = ref<SettingView | null>(null)
const changedLine = (s: SettingView) => s.lastChange?.by ? t('core.settings-history.line', { who: s.lastChange.by, when: when(s.lastChange.at) }) : t('core.settings-history.line-system', { when: s.lastChange ? when(s.lastChange.at) : '' })

const draft = reactive<Record<string, any>>({})
const resets = reactive<Record<string, boolean>>({})
const problems = reactive<Record<string, string>>({})
const saving = ref<string | null>(null)

// "Changed" leaves only the settings that differ from their default, so a page of forty reads as a short list.
const onlyChanged = ref(false)
const all = computed(() => data.value?.settings ?? [])
const shown = computed(() => onlyChanged.value ? all.value.filter(s => s.overridden || resets[s.key]) : all.value)

function load() {
  for (const s of all.value) {
    draft[s.key] = s.sensitive ? '' : toControl(s)
    resets[s.key] = false
  }
}
watch(data, load, { immediate: true })

const sections = computed(() => {
  // Sections are a module's own groups; where a page draws two modules' settings the same group stays apart.
  const groups = new Map<string, SettingView[]>()
  for (const s of shown.value) groups.set(`${s.module}:${s.group}`, [...(groups.get(`${s.module}:${s.group}`) ?? []), s])
  return [...groups].map(([id, settings]) => ({ id, module: settings[0]!.module, group: settings[0]!.group, settings }))
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
    : { key: s.key, value: fromControl(s.kind, draft[s.key], s.unset, s.default ?? s.value) })
  if (!changes.length || saving.value) return
  // A setting declared onChange: 'confirm' shows what will change and asks again.
  const asking = changesIn(settings).filter(s => s.onChange === 'confirm')
  if (asking.length) {
    const shown = (s: SettingView) => resets[s.key] ? defaultText(s) : controlText(s.kind, draft[s.key], words())
    const confirmed = await confirm({
      verb: t('core.settings-page.confirm-verb'),
      thing: asking.map(s => t(s.labelKey)).join(', '),
      consequence: asking.map(s => t('core.settings-page.confirm-change', { setting: t(s.labelKey), from: controlText(s.kind, toControl(s), words()), to: shown(s) })).join(' '),
      button: t('core.settings-page.confirm-button'),
    })
    if (!confirmed) return
  }
  saving.value = sectionId
  for (const s of settings) Reflect.deleteProperty(problems, s.key)
  try {
    await $api('/api/core/settings', { method: 'PUT', body: { changes, confirm: asking.length > 0 || undefined } })
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

const limit = (s: SettingView, which: 'min' | 'max') => typeof s[which] === 'number' ? s[which] : undefined
/** A duration's limits are written like 5m or 14d. */
const durationLimit = (s: SettingView, which: 'min' | 'max') => typeof s[which] === 'string' ? s[which] : undefined

/** A time is stored as 19:30; the control works in clock times. */
function timeOf(value: unknown) {
  try { return typeof value === 'string' && value ? parseTime(value) : undefined }
  catch { return undefined }
}

// On the Advanced page a section's heading also names its module, so "Sending" of two modules differ.
const sectionTitle = (section: { module: string, group: string }) => {
  const name = t(`${section.module}.settings-sections.${section.group}`)
  return advanced ? `${t(`${section.module}.module.name`)}: ${name}` : name
}
// One line for a section when every setting in it is changed by the same people; otherwise each says its own.
const sharedAbility = (settings: SettingView[]) => {
  const first = settings[0]?.changeLabelKey
  return first && settings.every(s => s.changeLabelKey === first && s.canChange) ? first : null
}
const resettable = (settings: SettingView[]) => settings.filter(s => s.canChange && s.overridden && !resets[s.key])
function resetSection(settings: SettingView[]) {
  for (const s of resettable(settings)) resetToDefault(s)
}
/** Offered while nothing is entered and the viewer may change it. */
const suggests = (s: SettingView) => !!s.suggestion && s.canChange && !draft[s.key]
const unitText = (s: SettingView) => s.unitKey ? t(s.unitKey) : undefined
const optionItems = (s: SettingView) => (s.options ?? []).map(o => ({ value: o, label: t(`${s.module}.settings.${s.group}.${s.name}.options.${o}`) }))
const words = () => ({
  on: t('core.settings-page.on'),
  off: t('core.settings-page.off'),
  rate: (count: number, per: string) => t('core.settings-page.rate', { count, period: per }),
  duration: durationWords,
  money: (minor: number) => new Intl.NumberFormat(language.value, { style: 'currency', currency: currency.value }).format(minor / 10 ** (new Intl.NumberFormat(language.value, { style: 'currency', currency: currency.value }).resolvedOptions().maximumFractionDigits ?? 2)),
})
/** Seconds as words in the largest unit that divides them, 1800 as "30 minutes", for the default and the confirmation. */
function durationWords(seconds: number): string {
  const { count, unit } = durationParts(seconds)
  // The browser's own wording, so one hour is not "1 hours" in any language.
  return new Intl.NumberFormat(language.value, { style: 'unit', unit, unitDisplay: 'long' }).format(count)
}
// A custom setting's own control: a component in its module's app/setting-editors folder, named for
// the key (finance.year.starts is SettingFinanceYearStarts). Without one it is typed as text.
function editorOf(s: SettingView) {
  const name = `Setting${s.key.split(/[.-]/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`
  const component = resolveComponent(name)
  return typeof component === 'string' ? null : component
}
const editors = computed(() => Object.fromEntries(shown.value.filter(s => s.kind === 'custom').map(s => [s.key, editorOf(s)])))
const defaultText = (s: SettingView) => controlText(s.kind, toControl(s, s.default), words())
const rate = (s: SettingView) => draft[s.key] as RateControl
function onRate(s: SettingView, part: Partial<RateControl>) {
  onEdit(s, { ...rate(s), ...part })
}

onMounted(() => {
  if (props.highlight) document.getElementById(`setting-${props.highlight}`)?.scrollIntoView({ block: 'center' })
})
</script>

<template>
  <PageFrame
    :title="title"
    :trail="trail"
    width="reading"
  >
    <SettingsSearch />
    <UAlert
      v-if="advanced"
      class="my-6"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('core.settings-page.advanced-warning-title')"
      :description="t('core.settings-page.advanced-warning')"
    />
    <USwitch
      v-model="onlyChanged"
      class="my-4"
      :label="t('core.settings-page.changed-only')"
    />
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="onlyChanged && !sections.length"
        :title="t('core.settings-page.nothing-changed')"
        icon="i-lucide-undo-2"
      />
      <form
        v-for="section in sections"
        :key="section.id"
        @submit.prevent="save(section.id, section.settings)"
      >
        <PageSection :title="sectionTitle(section)">
          <p
            v-if="sharedAbility(section.settings)"
            class="mb-4 text-sm text-muted"
          >
            {{ t('core.settings-page.who', { ability: t(sharedAbility(section.settings)!) }) }}
          </p>
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
                  v-else-if="s.kind === 'integer'"
                  :model-value="draft[s.key]"
                  :disabled="!s.canChange"
                  :min="limit(s, 'min')"
                  :max="limit(s, 'max')"
                  class="w-48"
                  @update:model-value="onEdit(s, $event)"
                />
                <FieldMoney
                  v-else-if="s.kind === 'money'"
                  :model-value="draft[s.key] === '' ? null : draft[s.key]"
                  :disabled="!s.canChange"
                  :min="limit(s, 'min')"
                  :max="limit(s, 'max')"
                  class="w-48"
                  @update:model-value="onEdit(s, $event ?? '')"
                />
                <DurationInput
                  v-else-if="s.kind === 'duration'"
                  :model-value="draft[s.key]"
                  :min="durationLimit(s, 'min')"
                  :max="durationLimit(s, 'max')"
                  :disabled="!s.canChange"
                  :label="t(s.labelKey)"
                  @update:model-value="onEdit(s, $event ?? null)"
                />
                <FieldColour
                  v-else-if="s.kind === 'colour'"
                  :model-value="draft[s.key]"
                  :disabled="!s.canChange"
                  @update:model-value="onEdit(s, $event)"
                />
                <FieldRecord
                  v-else-if="s.kind === 'reference' && s.record"
                  :model-value="draft[s.key] || null"
                  :record="s.record"
                  :disabled="!s.canChange"
                  @update:model-value="onEdit(s, $event ?? '')"
                />
                <component
                  :is="editors[s.key]"
                  v-else-if="s.kind === 'custom' && editors[s.key]"
                  :model-value="draft[s.key]"
                  :disabled="!s.canChange"
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
                <div
                  v-else-if="s.kind === 'rate'"
                  class="flex flex-wrap items-center gap-2"
                >
                  <UInputNumber
                    :model-value="rate(s).count"
                    :disabled="!s.canChange"
                    :min="limit(s, 'min')"
                    :max="limit(s, 'max')"
                    :aria-label="t('core.settings-page.rate-count', { setting: t(s.labelKey) })"
                    class="w-40"
                    @update:model-value="onRate(s, { count: $event ?? undefined })"
                  />
                  <span class="text-sm text-muted">{{ t('core.settings-page.rate-in') }}</span>
                  <DurationInput
                    :model-value="rate(s).per"
                    :disabled="!s.canChange"
                    :label="t('core.settings-page.rate-period', { setting: t(s.labelKey) })"
                    @update:model-value="onRate(s, { per: $event ?? undefined })"
                  />
                </div>
                <UInputTime
                  v-else-if="s.kind === 'time'"
                  :model-value="timeOf(draft[s.key])"
                  :disabled="!s.canChange"
                  class="w-48"
                  @update:model-value="onEdit(s, $event ? $event.toString().slice(0, 5) : '')"
                />
                <UInput
                  v-else
                  :model-value="draft[s.key]"
                  :type="s.sensitive ? 'password' : 'text'"
                  :disabled="!s.canChange"
                  :maxlength="s.maxLength"
                  :placeholder="s.sensitive ? t('core.settings-page.hidden') : s.suggestion ?? undefined"
                  class="max-w-md"
                  @update:model-value="onEdit(s, $event)"
                />
                <template
                  v-if="unitText(s) || s.kind === 'rate' || suggests(s)"
                  #hint
                >
                  <UButton
                    v-if="suggests(s)"
                    color="neutral"
                    variant="link"
                    size="sm"
                    :label="t('core.settings-page.use-suggestion', { value: s.suggestion ?? '' })"
                    @click="onEdit(s, s.suggestion)"
                  />
                  {{ s.kind === 'rate' ? t('core.settings-page.rate-hint') : unitText(s) }}
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
                <span v-else-if="!sharedAbility(section.settings)">{{ t('core.settings-page.who', { ability: t(s.changeLabelKey) }) }}</span>
                <UButton
                  v-if="s.lastChange && !s.sensitive"
                  color="neutral"
                  variant="link"
                  size="sm"
                  :label="changedLine(s)"
                  :aria-label="`${changedLine(s)}. ${t('core.settings-history.open-named', { setting: t(s.labelKey) })}`"
                  @click="history = s"
                />
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
              v-if="resettable(section.settings).length"
              color="neutral"
              variant="outline"
              :label="t('core.settings-page.reset-section')"
              :aria-label="t('core.settings-page.reset-section-named', { section: sectionTitle(section) })"
              @click="resetSection(section.settings)"
            />
            <UButton
              type="submit"
              :label="t('core.settings-page.save', { section: sectionTitle(section) })"
              :loading="saving === section.id"
              :disabled="!changesIn(section.settings).length || saving !== null"
            />
          </template>
        </PageSection>
      </form>
    </DataBoundary>
    <USlideover
      :open="!!history"
      :title="history ? t('core.settings-history.drawer-title', { setting: t(history.labelKey) }) : ''"
      :description="t('core.settings-history.drawer-description')"
      @update:open="!$event && (history = null)"
    >
      <template #body>
        <SettingChanges
          v-if="history"
          :query="{ key: history.key }"
          :kind="history.kind"
          @reverted="refresh()"
        />
      </template>
    </USlideover>
  </PageFrame>
</template>
