<!-- The sections of settings the Settings page type draws (UI-14), for a generated page or for the
     settings a bespoke screen manages (`screen` on a setting or its group), so a screen like Email
     sending saves its settings exactly as a generated page does. Each setting shows its value, its
     default with a Reset link once changed, who may change it (to someone who may not), its latest change and a "Quoted on
     public pages" tag where a content page shows it live. Changes save per section with a stated
     summary, asking again first for a setting declared onChange: 'confirm'. -->
<script setup lang="ts">
import type { Component } from 'vue'
import { parseTime } from '@internationalized/date'
import { controlText, fromControl, sameValue, toControl, type RateControl } from '../../shared/controls'
import { durationParts, type DurationUnit } from '../../kit/duration'
import { catalogueLabel, searchable, type CatalogueName } from '../../shared/choices'
import { inSentence } from '../utils/sentence'

interface SettingView {
  key: string
  module: string
  group: string
  name: string
  kind: string
  labelKey: string
  helpKey: string
  unitKey?: string
  units?: DurationUnit[]
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
  /** A text of several lines, drawn as a text area. */
  multiline?: boolean
  periodMin?: string
  periodMax?: string
  options?: string[]
  /** Where a choice's options are standard codes from one of the kit's lists, which list. */
  catalogue?: CatalogueName | null
  of?: string
  /** reference only: the record type it names. */
  record?: string
  /** list of text only: the route listing the values to pick from. */
  choices?: string
}

const { $api } = useNuxtApp()
const props = defineProps<{
  /** The page of settings to draw, by id (`core.sign-in`, `core.advanced`, `gallery.settings`). */
  page?: string
  /** Or the settings a bespoke screen manages, by its address (`/admin/email`). */
  screen?: string
  /** A setting to scroll into view and highlight, from settings search. */
  highlight?: string
  /** Only the settings that differ from their default. */
  onlyChanged?: boolean
  /** Settings the screen already shows in its own way, left out here. */
  omit?: string[]
  /** A screen with one section of settings may give it its own heading ("Email settings"). */
  heading?: string
}>()
defineSlots<{
  /** Beneath one setting's field: a screen's preview or warning, with the value as edited. */
  'after-field'?: (props: { setting: SettingView, value: unknown }) => unknown
}>()
/** After a section saves, with the keys it changed, so a screen can refresh what it draws from them. */
const emit = defineEmits<{ saved: [keys: string[]] }>()

const { t } = useT()
const toast = useToast()
const { confirm } = useConfirm()
const { language, day: when, dayOfYear: dayAndMonth } = useDates()
const { data: publicSettings } = usePublicSettings()
const currency = computed(() => (publicSettings.value?.['core.locale.currency']?.value as string | undefined) ?? 'GBP')
const { data, status, error, refresh } = await useAPI<{ page: { id: string, module: string } | null, settings: SettingView[] }>('/api/core/settings', {
  query: props.page ? { page: props.page } : { screen: props.screen },
  key: props.page ? `core:settings:page:${props.page}` : `core:settings:screen:${props.screen}`,
})
const advanced = props.page === 'core.advanced'
const history = ref<SettingView | null>(null)
const changedLine = (s: SettingView) => s.lastChange?.by ? t('core.settings-history.line', { who: s.lastChange.by, when: when(s.lastChange.at) }) : t('core.settings-history.line-system', { when: s.lastChange ? when(s.lastChange.at) : '' })

const draft = reactive<Record<string, any>>({})
const resets = reactive<Record<string, boolean>>({})
const problems = reactive<Record<string, string>>({})
const saving = ref<string | null>(null)

// "Changed" leaves only the settings that differ from their default, so a page of forty reads as a short list.
// A setting the system keeps (the brand's revision, a logo the Branding screen sets) is never drawn as a control.
const all = computed(() => (data.value?.settings ?? []).filter(s => !s.managed && !props.omit?.includes(s.key)))
const shown = computed(() => props.onlyChanged ? all.value.filter(s => s.overridden || resets[s.key]) : all.value)

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
    const confirmed = await confirm({
      verb: t('core.settings-page.confirm-verb'),
      thing: t('core.settings-page.confirm-thing', { count: asking.length }),
      consequence: asking.map(confirmLine).join(' '),
      button: t('core.settings-page.confirm-button', { count: asking.length }),
      // Red only where the change takes something away: a setting cleared, or records kept for less time.
      tone: asking.some(takesAway) ? 'danger' : 'primary',
    })
    if (!confirmed) return
  }
  saving.value = sectionId
  for (const s of settings) Reflect.deleteProperty(problems, s.key)
  try {
    await $api('/api/core/settings', { method: 'PUT', body: { changes, confirm: asking.length > 0 || undefined } })
    toast.add({ title: t('core.settings-page.saved', { count: changes.length }), color: 'success', icon: 'i-lucide-circle-check' })
    // The theatre's name, brand and public settings are drawn by the shells too: refresh them with the page.
    await Promise.all([refresh(), refreshNuxtData(['core:brand', 'core:public-settings'])])
    emit('saved', changes.map(c => c.key))
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

/** A value as the confirmation names it: a choice by its label, and nothing as "not set". */
function valueText(s: SettingView, control: unknown): string {
  const items = itemsOf(s)
  const label = (v: unknown) => items.find(i => i.value === v)?.label ?? String(v)
  if (items.length && Array.isArray(control)) return control.length ? control.map(label).join(', ') : t('core.settings-page.not-set')
  if (items.length && typeof control === 'string' && control) return label(control)
  // A day of the year kept as 07-31, with its own editor, reads as 31 July.
  const dayOfYear = typeof control === 'string' && editors.value[s.key] ? /^(\d{2})-(\d{2})$/.exec(control) : null
  if (dayOfYear) return dayAndMonth(Number(dayOfYear[1]), Number(dayOfYear[2]))
  return controlText(s.kind, control, words()) || t('core.settings-page.not-set')
}
const isBlank = (control: unknown) => control === null || control === undefined || control === '' || (Array.isArray(control) && !control.length)
const before = (s: SettingView) => toControl(s)
const after = (s: SettingView) => resets[s.key] ? toControl(s, s.default) : draft[s.key]
/** One sentence for each setting the confirmation asks about, the setting first, so it keeps its own capital. */
function confirmLine(s: SettingView): string {
  const setting = t(s.labelKey)
  if (isBlank(before(s))) return t('core.settings-page.confirm-set', { setting, to: valueText(s, after(s)) })
  return t('core.settings-page.confirm-change', { setting, from: valueText(s, before(s)), to: valueText(s, after(s)) })
}
/** Whether a change takes something away: a value cleared, a switch turned off, or records kept for less time. */
function takesAway(s: SettingView): boolean {
  if (!isBlank(before(s)) && isBlank(after(s))) return true
  if (s.kind === 'boolean') return before(s) === true && after(s) === false
  const [was, now] = [before(s), after(s)]
  return s.kind === 'duration' && /retention|keep/.test(s.key) && typeof was === 'number' && typeof now === 'number' && now < was
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
/**
 * Whether Reset is offered. Not where the default is "not set" and a change is confirmed, such as the
 * site's address or the time zone, which setup records: resetting would only break what depends on them.
 */
const mayReset = (s: SettingView) => s.canChange && !(s.unset && s.default == null && s.onChange === 'confirm')
const resettable = (settings: SettingView[]) => settings.filter(s => mayReset(s) && s.overridden && !resets[s.key])
function resetSection(settings: SettingView[]) {
  for (const s of resettable(settings)) resetToDefault(s)
}
/** Offered while nothing is entered and the viewer may change it. */
const suggests = (s: SettingView) => !!s.suggestion && s.canChange && !draft[s.key]
const unitText = (s: SettingView) => s.unitKey ? t(s.unitKey) : undefined
// A choice's options: its own, labelled from the catalogue of strings, or a kit list's standard codes,
// labelled by the browser and put in the order of their names. A value the list no longer has (a
// renamed time zone) stays shown, so the control never reads as empty.
const optionItems = computed(() => Object.fromEntries(all.value.filter(s => s.options).map((s) => {
  const values = [...s.options!]
  for (const v of [s.value].flat()) if (typeof v === 'string' && v && !values.includes(v)) values.push(v)
  const items = values.map(o => ({ value: o, label: s.catalogue ? catalogueLabel(s.catalogue, o, language.value) : t(`${s.module}.settings.${s.group}.${s.name}.options.${o}`) }))
  if (s.catalogue === 'country') items.sort((a, b) => a.label.localeCompare(b.label, language.value))
  return [s.key, items]
})))
const itemsOf = (s: SettingView) => optionItems.value[s.key] ?? []
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
// A setting's own control: a component in its module's app/setting-editors folder, named for the key
// (finance.year.starts is SettingFinanceYearStarts). A custom setting without one is typed as text; any
// other kind may have one too, such as the year end's day and month. Editors are registered globally,
// so a key without one is simply not among the app's components.
const components = getCurrentInstance()!.appContext.components
function editorOf(s: SettingView) {
  const name = `Setting${s.key.split(/[.-]/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`
  return name in components ? resolveComponent(name) as Component : null
}
const editors = computed(() => Object.fromEntries(shown.value.map(s => [s.key, editorOf(s)]).filter(([, editor]) => editor)))
/** The default as the control shows it: a choice by its label, and nothing as "not set" rather than a blank. */
function defaultText(s: SettingView): string {
  const value = s.default
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return t('core.settings-page.not-set')
  const items = itemsOf(s)
  if (items.length) {
    const label = (v: unknown) => items.find(i => i.value === v)?.label ?? String(v)
    if (Array.isArray(value)) return value.map(label).join(', ')
    return label(value)
  }
  return controlText(s.kind, toControl(s, value), words()) || t('core.settings-page.not-set')
}
const rate = (s: SettingView) => draft[s.key] as RateControl
function onRate(s: SettingView, part: Partial<RateControl>) {
  onEdit(s, { ...rate(s), ...part })
}

onMounted(() => {
  if (props.highlight) document.getElementById(`setting-${props.highlight}`)?.scrollIntoView({ block: 'center' })
})
</script>

<template>
  <div>
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
        novalidate
        @submit.prevent="save(section.id, section.settings)"
      >
        <PageSection :title="heading ?? sectionTitle(section)">
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
                <component
                  :is="editors[s.key]"
                  v-if="editors[s.key]"
                  :model-value="draft[s.key]"
                  :disabled="!s.canChange"
                  @update:model-value="onEdit(s, $event)"
                />
                <USwitch
                  v-else-if="s.kind === 'boolean'"
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
                  class="w-32"
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
                  :units="s.units"
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
                <!-- A setting with a fixed set of values is a dropdown, with a search box once the
                     list is long (shared/choices.ts); a list of them is square ticks. -->
                <USelectMenu
                  v-else-if="s.kind === 'choice' && searchable(itemsOf(s))"
                  :model-value="draft[s.key] || undefined"
                  :items="itemsOf(s)"
                  value-key="value"
                  :search-input="{ placeholder: t('core.settings-page.search-options') }"
                  :placeholder="t('core.settings-page.choose')"
                  virtualize
                  :disabled="!s.canChange"
                  role="combobox"
                  class="w-72 max-w-full"
                  @update:model-value="onEdit(s, $event ?? '')"
                />
                <USelect
                  v-else-if="s.kind === 'choice'"
                  :model-value="draft[s.key] || undefined"
                  :items="itemsOf(s)"
                  value-key="value"
                  :placeholder="t('core.settings-page.choose')"
                  :disabled="!s.canChange"
                  class="w-72 max-w-full"
                  @update:model-value="onEdit(s, $event)"
                />
                <USelectMenu
                  v-else-if="s.kind === 'list' && s.of === 'choice' && searchable(itemsOf(s))"
                  :model-value="draft[s.key]"
                  :items="itemsOf(s)"
                  value-key="value"
                  multiple
                  :search-input="{ placeholder: t('core.settings-page.search-options') }"
                  :placeholder="t('core.settings-page.choose')"
                  virtualize
                  :disabled="!s.canChange"
                  role="combobox"
                  class="w-72 max-w-full"
                  @update:model-value="onEdit(s, $event)"
                />
                <UCheckboxGroup
                  v-else-if="s.kind === 'list' && s.of === 'choice'"
                  :model-value="draft[s.key]"
                  :items="itemsOf(s)"
                  value-key="value"
                  :disabled="!s.canChange"
                  @update:model-value="onEdit(s, $event)"
                />
                <FieldListChoices
                  v-else-if="s.kind === 'list' && s.choices"
                  :model-value="draft[s.key]"
                  :route="s.choices"
                  :disabled="!s.canChange"
                  @update:model-value="onEdit(s, $event)"
                />
                <!-- Free values are tags: a value typed and left, or pasted, is kept, not lost. -->
                <UInputTags
                  v-else-if="s.kind === 'list'"
                  :model-value="draft[s.key]"
                  :max-length="s.maxLength"
                  :placeholder="t('core.settings-page.add-value')"
                  add-on-blur
                  add-on-paste
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
                    class="w-32"
                    @update:model-value="onRate(s, { count: $event ?? undefined })"
                  />
                  <span class="text-sm text-muted">{{ t('core.settings-page.rate-in') }}</span>
                  <DurationInput
                    :id="`setting-${s.key}-per`"
                    :model-value="rate(s).per"
                    :min="s.periodMin"
                    :max="s.periodMax"
                    :disabled="!s.canChange"
                    :label="t('core.settings-page.rate-period', { setting: t(s.labelKey) })"
                    @update:model-value="onRate(s, { per: $event ?? undefined })"
                  />
                </div>
                <UInputTime
                  v-else-if="s.kind === 'time'"
                  :model-value="timeOf(draft[s.key])"
                  :disabled="!s.canChange"
                  class="w-32"
                  @update:model-value="onEdit(s, $event ? $event.toString().slice(0, 5) : '')"
                />
                <UTextarea
                  v-else-if="s.kind === 'text' && s.multiline"
                  :model-value="draft[s.key]"
                  :disabled="!s.canChange"
                  :maxlength="s.maxLength"
                  :rows="3"
                  autoresize
                  class="max-w-md"
                  @update:model-value="onEdit(s, $event)"
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
              <slot
                name="after-field"
                :setting="s"
                :value="draft[s.key]"
              />

              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                <span v-if="(s.overridden || resets[s.key]) && (mayReset(s) || !s.canChange)">
                  {{ t('core.settings-page.default', { value: defaultText(s) }) }}
                  <UButton
                    v-if="mayReset(s) && !resets[s.key]"
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
              :label="t('core.settings-page.save', { section: inSentence(t(`${section.module}.settings-sections.${section.group}`), { article: false }) })"
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
  </div>
</template>
