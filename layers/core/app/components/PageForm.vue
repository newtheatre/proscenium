<!-- The Form page type (UI-13). A module supplies a schema and its fields; the component lays them
     out in one column with labels above, validates with the schema the server validates with, shows
     the same message the server would, keeps the save bar in view, names the act on its button,
     cannot be pressed twice, asks once before losing changes, and shows a conflict rather than
     overwriting. Up to about six fields it opens as a panel over the list; longer forms get a page. -->
<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'
import type { z } from 'zod'
import type { FormErrorEvent } from '@nuxt/ui'
import { isConflict, mergeConflict, PANEL_FIELD_LIMIT } from '../../shared/form'
import type { RefusalView } from '../utils/refusal'

export interface FormField {
  name: string
  label: string
  /** date holds "2027-09-01"; daterange { start, end } of those; datetime an instant in milliseconds, entered in
   *  the theatre's time zone; money an amount in the currency's minor unit (pence). */
  kind: 'text' | 'email' | 'textarea' | 'number' | 'money' | 'date' | 'daterange' | 'datetime' | 'select' | 'checkbox' | 'radio' | 'ticks'
  help?: string
  optional?: boolean
  placeholder?: string
  /**
   * Choices for select, radio and ticks. A radio's values may be numbers (0, 1 or 2 companions).
   * A description sits under its label, for radio and ticks.
   */
  options?: { value: string | number, label: string, description?: string }[]
  /** ticks only: each ticked option opens a short note of at most `max` characters; leave out for no notes. */
  notes?: { max: number, label: string }
  /** Shows the field only while this answers true for the form's values, as a follow-up question. */
  showIf?: (values: Record<string, any>) => boolean
  /** Sits beside the next field: only when the two are one thought (start and end). */
  pairWithNext?: boolean
}

const props = withDefaults(defineProps<{
  title: string
  /** A line under the title, for what the form will do. */
  description?: string
  /** The button names the act: "Create performance", "Refund £12.00". Never "Submit". */
  submitLabel: string
  /** The schema the server validates with, so both show the same message for the same value. */
  schema: z.ZodType
  fields: FormField[]
  initial: Record<string, unknown>
  /** Sends the values. Throws what a failed request throws, so refusals reach the form. */
  submit: (values: Record<string, any>, version?: string | number) => Promise<unknown>
  /** The saved record's version, sent back so a stale save is refused. */
  version?: string | number
  /** Fetches what is saved now, to settle a conflict. */
  current?: () => Promise<{ values: Record<string, unknown>, version?: string | number }>
  /** Where to go once saved, and on Cancel. Default: back to where the person came from. */
  returnTo?: string
  /** Long forms keep a draft on the device under this key. */
  draftKey?: string
  /** Panel mode: whether the panel is open. */
  open?: boolean
}>(), { description: undefined, open: undefined, version: undefined, current: undefined, returnTo: undefined, draftKey: undefined })
const emit = defineEmits<{
  (e: 'saved', result: unknown): void
  (e: 'cancel'): void
  (e: 'update:open', value: boolean): void
}>()

const { t } = useT()
const router = useRouter()
const { confirm } = useConfirm()
const toast = useToast()

// A short form opens as a panel over the list when the list asks for one (it passes `open`); at its
// own address, or when long, it is a page. The component decides from the field count, not taste.
const USlideover = resolveComponent('USlideover')
const PageFrame = resolveComponent('PageFrame')
const bodySlot = computed(() => panel.value ? 'body' : 'default')
// The buttons sit in the panel's or the page's footer, outside the form they submit.
const formId = useId()
const panel = computed(() => props.open !== undefined && props.fields.length <= PANEL_FIELD_LIMIT)
// A tick list holds { value, note? } for each ticked option, in the order of the options.
function tickOf(name: string, value: string | number) {
  return (state[name] as { value: string | number, note?: string }[] | undefined)?.find(x => x.value === value)
}
function setTick(g: FormField, value: string | number, on: boolean | 'indeterminate') {
  const kept = ((state[g.name] as { value: string | number, note?: string }[] | undefined) ?? []).filter(x => x.value !== value)
  const next = on === true ? [...kept, tickOf(g.name, value) ?? { value }] : kept
  state[g.name] = (g.options ?? []).flatMap(o => next.filter(x => x.value === o.value))
}
// A checkbox, a radio group and a checkbox group carry their own label (a group's is its legend).
const ownsLabel = (g: FormField) => g.kind === 'checkbox' || g.kind === 'radio' || (g.kind === 'ticks' && !g.notes)
function setTicks(g: FormField, values: string[]) {
  state[g.name] = (g.options ?? []).filter(o => values.includes(String(o.value))).map(o => tickOf(g.name, o.value) ?? { value: o.value })
}
function setNote(g: FormField, value: string | number, note: string) {
  state[g.name] = ((state[g.name] as { value: string | number, note?: string }[] | undefined) ?? []).map(x => x.value === value ? (note ? { value, note } : { value }) : x)
}

const state = reactive<Record<string, any>>({ ...props.initial })
const base = ref<Record<string, unknown>>({ ...props.initial })
const version = ref(props.version)
const form = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void, clear: () => void }>('form')

const submitting = ref(false)
const saved = ref(false)
const refusal = ref<RefusalView | null>(null)
const summary = ref<{ id?: string, name: string, message: string }[]>([])
const conflicts = ref<{ field: string, mine: unknown, theirs: unknown, take: 'mine' | 'theirs' }[]>([])
let theirsNow: Record<string, unknown> = {}

// Two fields sit side by side only when they are one thought (start and end).
const rows = computed(() => {
  const out: FormField[][] = []
  const shown = props.fields.filter(f => !f.showIf || f.showIf(state))
  for (let i = 0; i < shown.length; i++) {
    const f = shown[i]!
    const next = shown[i + 1]
    if (f.pairWithNext && next) {
      out.push([f, next])
      i++
    }
    else {
      out.push([f])
    }
  }
  return out
})

function focusField(item: { id?: string, name: string }) {
  const el = (item.id && document.getElementById(item.id)) || document.querySelector<HTMLElement>(`[name='${item.name}']`)
  el?.focus()
}

const dirty = computed(() => JSON.stringify(state) !== JSON.stringify(base.value))
const labelOf = (name: string) => props.fields.find(f => f.name === name)?.label ?? name
const show = (value: unknown) => value === undefined || value === null || value === '' ? t('core.form.empty-value') : String(value)

// A long form keeps a draft on the device and offers to restore it.
const draftStorage = computed(() => props.draftKey ? `proscenium:draft:${props.draftKey}` : undefined)
const draft = ref<Record<string, unknown> | null>(null)
onMounted(() => {
  if (!draftStorage.value) return
  try {
    const raw = localStorage.getItem(draftStorage.value)
    if (raw && raw !== JSON.stringify(state)) draft.value = JSON.parse(raw)
  }
  catch { /* a private window: no draft */ }
})
watchDebounced(state, () => {
  if (!draftStorage.value || saved.value || !dirty.value) return
  try { localStorage.setItem(draftStorage.value, JSON.stringify(state)) }
  catch { /* no storage: the draft is simply not kept */ }
}, { debounce: 500, deep: true }) // not-policy: a typing pause
function restoreDraft() {
  Object.assign(state, draft.value)
  draft.value = null
}
function discardDraft() {
  draft.value = null
  try { if (draftStorage.value) localStorage.removeItem(draftStorage.value) }
  catch { /* nothing to remove */ }
}

function onError(event: FormErrorEvent) {
  summary.value = event.errors.map(e => ({ id: e.id, name: String(e.name), message: e.message }))
  const first = event.errors[0]
  if (first?.id) document.getElementById(first.id)?.focus()
}

async function onSubmit() {
  if (submitting.value) return // cannot be pressed twice
  submitting.value = true
  refusal.value = null
  summary.value = []
  try {
    const result = await props.submit({ ...state }, version.value)
    saved.value = true
    discardDraft()
    toast.add({ title: t('core.form.saved'), color: 'success', icon: 'i-lucide-circle-check' })
    emit('saved', result)
    if (panel.value) emit('update:open', false)
    else await (props.returnTo ? navigateTo(props.returnTo) : router.back())
  }
  catch (error) {
    await onFailure(error)
  }
  finally {
    submitting.value = false
  }
}

async function onFailure(error: unknown) {
  const failure = toRefusal(error)
  if (isConflict(failure.code) && props.current) {
    const latest = await props.current()
    theirsNow = latest.values
    const merge = mergeConflict(base.value, { ...state }, latest.values)
    Object.assign(state, merge.merged)
    base.value = { ...latest.values }
    version.value = latest.version
    conflicts.value = merge.conflicts.map(field => ({ field, mine: state[field], theirs: latest.values[field], take: 'mine' }))
    if (!conflicts.value.length) refusal.value = failure
    return
  }
  if (failure.fields) {
    form.value?.setErrors(Object.entries(failure.fields).map(([name, message]) => ({ name, message: phrase(message) ?? message })))
    summary.value = Object.entries(failure.fields).map(([name, message]) => ({ name, message: phrase(message) ?? message }))
  }
  refusal.value = failure
}

function settleConflicts() {
  for (const c of conflicts.value) state[c.field] = c.take === 'theirs' ? theirsNow[c.field] : c.mine
  conflicts.value = []
}

async function cancel() {
  if (dirty.value && !(await confirm({ verb: t('core.form.leave'), thing: t('core.form.leave-thing'), consequence: t('core.form.leave-consequence') }))) return
  saved.value = true // asked once
  emit('cancel')
  // A panel is kept by its list, so it opens clean the next time.
  if (panel.value) Object.assign(state, base.value)
  if (panel.value) emit('update:open', false)
  else await (props.returnTo ? navigateTo(props.returnTo) : router.back())
}

// Leaving with unsaved changes asks once.
onBeforeRouteLeave(async () => {
  if (saved.value || !dirty.value) return true
  return confirm({ verb: t('core.form.leave'), thing: t('core.form.leave-thing'), consequence: t('core.form.leave-consequence') })
})
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value && !saved.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>

<template>
  <!-- One body, placed in the panel's body slot or the page's default slot. -->
  <component
    :is="panel ? USlideover : PageFrame"
    v-bind="panel ? { open, title, description } : { title, description, width: 'reading' }"
    @update:open="(v: boolean) => { if (!v) cancel(); else emit('update:open', v) }"
  >
    <template #[bodySlot]>
      <div class="space-y-4">
        <RefusalPanel
          v-if="refusal && !summary.length"
          :refusal="refusal"
        />

        <!-- A summary at the top links to each invalid field. -->
        <UAlert
          v-if="summary.length"
          color="error"
          icon="i-lucide-octagon-alert"
          :title="t('core.form.problems', { count: summary.length })"
          role="alert"
        >
          <template #description>
            <ul class="list-disc pl-5">
              <li
                v-for="item in summary"
                :key="item.name"
              >
                <ULink
                  :href="`#${item.id ?? item.name}`"
                  class="underline"
                  @click.prevent="focusField(item)"
                >
                  {{ labelOf(item.name) }}
                </ULink>: {{ item.message }}
              </li>
            </ul>
          </template>
        </UAlert>

        <UAlert
          v-if="draft"
          color="info"
          icon="i-lucide-history"
          :title="t('core.form.draft')"
          :actions="[
            { label: t('core.form.draft-restore'), color: 'neutral', variant: 'outline', onClick: restoreDraft },
            { label: t('core.form.draft-discard'), color: 'neutral', variant: 'ghost', onClick: discardDraft },
          ]"
        />

        <!-- A conflict shows both versions of what changed and asks which to keep. -->
        <UAlert
          v-if="conflicts.length"
          color="warning"
          icon="i-lucide-git-compare"
          :title="t('core.form.conflict.title')"
          :description="t('core.form.conflict.description')"
          role="alert"
        />
        <URadioGroup
          v-for="c in conflicts"
          :key="c.field"
          v-model="c.take"
          :legend="labelOf(c.field)"
          variant="table"
          :items="[
            { value: 'mine', label: t('core.form.conflict.mine', { value: show(c.mine) }) },
            { value: 'theirs', label: t('core.form.conflict.theirs', { value: show(c.theirs) }) },
          ]"
        />
        <UButton
          v-if="conflicts.length"
          :label="t('core.form.conflict.apply')"
          color="neutral"
          variant="outline"
          @click="settleConflicts"
        />

        <UForm
          :id="formId"
          ref="form"
          :schema="schema"
          :state="state"
          :validate-on="['blur', 'change']"
          class="space-y-4"
          @submit="onSubmit"
          @error="onError"
        >
          <div
            v-for="row in rows"
            :key="row[0]!.name"
            :class="row.length > 1 ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : ''"
          >
            <UFormField
              v-for="g in row"
              :key="g.name"
              :name="g.name"
              :label="ownsLabel(g) ? undefined : g.optional ? `${g.label} ${t('core.form.optional')}` : g.label"
              :help="g.help"
            >
              <UTextarea
                v-if="g.kind === 'textarea'"
                v-model="state[g.name]"
              />
              <URadioGroup
                v-else-if="g.kind === 'radio'"
                v-model="state[g.name]"
                :items="(g.options ?? []).map(o => ({ value: o.value, label: o.label, description: o.description }))"
                value-key="value"
                :legend="g.label"
                :orientation="(g.options ?? []).some(o => o.description) ? 'vertical' : 'horizontal'"
              />
              <!-- A choice of many is square ticks (UCheckboxGroup), never a radio-like control.
                   Only when each tick opens its own note is it a list of single checkboxes. -->
              <UCheckboxGroup
                v-else-if="g.kind === 'ticks' && !g.notes"
                :model-value="((state[g.name] ?? []) as { value: string | number }[]).map(x => String(x.value))"
                :items="(g.options ?? []).map(o => ({ value: String(o.value), label: o.label, description: o.description }))"
                value-key="value"
                :legend="g.label"
                @update:model-value="(v: unknown) => setTicks(g, v as string[])"
              />
              <fieldset
                v-else-if="g.kind === 'ticks'"
                class="space-y-3"
              >
                <legend class="sr-only">
                  {{ g.label }}
                </legend>
                <div
                  v-for="o in g.options ?? []"
                  :key="String(o.value)"
                  class="space-y-2"
                >
                  <UCheckbox
                    :id="`${g.name}-${o.value}`"
                    :model-value="!!tickOf(g.name, o.value)"
                    :label="o.label"
                    :description="o.description"
                    @update:model-value="setTick(g, o.value, $event)"
                  />
                  <UFormField
                    v-if="g.notes && tickOf(g.name, o.value)"
                    :label="g.notes.label"
                    :hint="`${(tickOf(g.name, o.value)?.note ?? '').length}/${g.notes.max}`"
                    class="ms-7"
                  >
                    <UInput
                      :model-value="tickOf(g.name, o.value)?.note ?? ''"
                      :maxlength="g.notes.max"
                      @update:model-value="setNote(g, o.value, String($event))"
                    />
                  </UFormField>
                </div>
              </fieldset>
              <USelect
                v-else-if="g.kind === 'select'"
                v-model="state[g.name]"
                :items="g.options ?? []"
                value-key="value"
              />
              <UCheckbox
                v-else-if="g.kind === 'checkbox'"
                v-model="state[g.name]"
                :label="g.label"
              />
              <UInputNumber
                v-else-if="g.kind === 'number'"
                v-model="state[g.name]"
              />
              <FieldMoney
                v-else-if="g.kind === 'money'"
                v-model="state[g.name]"
              />
              <FieldDate
                v-else-if="g.kind === 'date'"
                v-model="state[g.name]"
              />
              <FieldDateRange
                v-else-if="g.kind === 'daterange'"
                v-model="state[g.name]"
              />
              <FieldDateTime
                v-else-if="g.kind === 'datetime'"
                v-model="state[g.name]"
              />
              <UInput
                v-else
                v-model="state[g.name]"
                :type="g.kind"
                :placeholder="g.placeholder"
              />
            </UFormField>
          </div>
        </UForm>
      </div>
    </template>
    <!-- The save bar stays in view at the foot. -->
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        :label="t('core.form.cancel')"
        :disabled="submitting"
        @click="cancel"
      />
      <UButton
        type="submit"
        :form="formId"
        :label="submitLabel"
        :loading="submitting"
        :disabled="submitting || conflicts.length > 0"
      />
    </template>
  </component>
</template>
