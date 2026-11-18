<!-- One question as a respondent answers it. The value it gives is exactly what the engine checks
     and the server stores: an option's id for a choice, whole minor units for money, a calendar date
     for a date. The builder's preview and the live form draw the same component. -->
<script setup lang="ts">
import { parseTime } from '@internationalized/date'
import { OTHER, type Address, type Issue, type Question, type Value } from '../../shared/engine'

const props = defineProps<{ question: Question, required: boolean, issues?: Issue[], other?: string }>()
const emit = defineEmits<{ 'update:other': [text: string] }>()
const model = defineModel<Value>()
const { t } = useT()
const q = computed(() => props.question)
const TYPED = ['email', 'phone', 'url', 'number', 'money', 'date', 'time', 'datetime', 'consent', 'rating', 'scale']
const error = computed(() => {
  const issue = props.issues?.[0]
  if (!issue) return undefined
  // An answer of the wrong kind is told what kind is wanted, where the type says it.
  if (issue.rule === 'type' && TYPED.includes(q.value.type)) return t(`forms.issues.type-${q.value.type}`)
  return issue.message || t(`forms.issues.${issue.rule}`, issue.params ?? {})
})
const options = computed(() => [...(q.value.options ?? []).map(o => ({ value: o.id, label: o.label })), ...(q.value.allowOther ? [{ value: OTHER, label: t('forms.screens.options.other') }] : [])])
const text = computed({ get: () => (typeof model.value === 'string' ? model.value : ''), set: (v: string) => { model.value = v === '' ? undefined : v } })
const list = computed({ get: () => (Array.isArray(model.value) ? model.value as string[] : []), set: (v: string[]) => { model.value = v.length ? v : undefined } })
const otherChosen = computed(() => model.value === OTHER || list.value.includes(OTHER))

// A ranking starts in the order the options were written and is an answer once anything moves.
const ranking = computed(() => list.value.length ? list.value : (q.value.options ?? []).map(o => o.id))
function rank(index: number, by: number) {
  const next = [...ranking.value]
  const [id] = next.splice(index, 1)
  next.splice(index + by, 0, id!)
  model.value = next
}
const labelOf = (id: string) => q.value.options?.find(o => o.id === id)?.label ?? id

const steps = computed(() => {
  const min = q.value.type === 'rating' ? 1 : q.value.scale?.min ?? 0
  const max = q.value.scale?.max ?? 5 // not-policy: the engine's default top of a scale
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i)
})

const address = computed(() => (model.value && typeof model.value === 'object' && !Array.isArray(model.value) ? model.value : {}) as Partial<Address>)
function setAddress(key: keyof Address, value: string) {
  const next = { ...address.value, [key]: value || undefined }
  model.value = Object.values(next).some(Boolean) ? next as Address : undefined
}
const ADDRESS: (keyof Address)[] = ['line1', 'line2', 'town', 'county', 'postcode']
const AUTOCOMPLETE: Record<string, string> = { line1: 'address-line1', line2: 'address-line2', town: 'address-level2', county: 'address-level1', postcode: 'postal-code' }
const autocompleteOf = (part: string): string | undefined => AUTOCOMPLETE[part]

const DATE_LENGTH = 10 // not-policy: the length of a date
const timeOf = (value: string) => {
  try { return value ? parseTime(value) : undefined }
  catch { return undefined }
}
const clock = (v: unknown) => v ? String(v).slice(0, 5) : '' // not-policy: the length of "HH:MM"
const datePart = computed(() => text.value.slice(0, DATE_LENGTH))
const timePart = computed(() => text.value.slice(DATE_LENGTH + 1))
const setDateTime = (date: string, time: string) => { text.value = date ? `${date}T${time || '00:00'}` : '' }
</script>

<template>
  <UFormField
    :label="q.type === 'consent' ? undefined : formsQuestionName(q)"
    :help="q.type === 'consent' ? undefined : q.help"
    :required="required && q.type !== 'consent'"
    :error="error"
  >
    <UInput
      v-if="q.type === 'text.short'"
      v-model="text"
    />
    <UTextarea
      v-else-if="q.type === 'text.long'"
      v-model="text"
      :rows="4"
      autoresize
    />
    <UInput
      v-else-if="q.type === 'email'"
      v-model="text"
      inputmode="email"
      autocomplete="email"
    />
    <UInput
      v-else-if="q.type === 'phone'"
      v-model="text"
      inputmode="tel"
      autocomplete="tel"
    />
    <UInput
      v-else-if="q.type === 'url'"
      v-model="text"
      inputmode="url"
      placeholder="https://"
    />
    <UInputNumber
      v-else-if="q.type === 'number'"
      class="w-40"
      :model-value="typeof model === 'number' ? model : null"
      @update:model-value="model = $event ?? undefined"
    />
    <FieldMoney
      v-else-if="q.type === 'money'"
      class="w-40"
      :model-value="typeof model === 'number' ? model : null"
      :steppers="false"
      @update:model-value="model = $event ?? undefined"
    />
    <FieldDate
      v-else-if="q.type === 'date'"
      class="w-48"
      :model-value="text"
      @update:model-value="text = $event ?? ''"
    />
    <UInputTime
      v-else-if="q.type === 'time'"
      class="w-28"
      :model-value="timeOf(text)"
      :hour-cycle="24"
      @update:model-value="text = clock($event)"
    />
    <div
      v-else-if="q.type === 'datetime'"
      class="flex flex-wrap items-center gap-2"
    >
      <FieldDate
        class="w-48"
        :model-value="datePart"
        @update:model-value="setDateTime($event ?? '', timePart)"
      />
      <UInputTime
        class="w-28"
        :model-value="timeOf(timePart)"
        :hour-cycle="24"
        :aria-label="t('forms.screens.fill.time')"
        @update:model-value="setDateTime(datePart, clock($event))"
      />
    </div>
    <URadioGroup
      v-else-if="q.type === 'choice.single'"
      :model-value="typeof model === 'string' ? model : undefined"
      :items="options"
      @update:model-value="model = $event as string"
    />
    <UCheckboxGroup
      v-else-if="q.type === 'choice.multiple'"
      v-model="list"
      :items="options"
    />
    <USelectMenu
      v-else-if="q.type === 'choice.dropdown' && q.multiple"
      v-model="list"
      multiple
      :items="options"
      value-key="value"
      :placeholder="t('forms.screens.fill.choose')"
    />
    <USelectMenu
      v-else-if="q.type === 'choice.dropdown'"
      :model-value="typeof model === 'string' ? model : undefined"
      :items="options"
      value-key="value"
      :placeholder="t('forms.screens.fill.choose')"
      @update:model-value="model = $event as string"
    />
    <ol
      v-else-if="q.type === 'choice.ranking'"
      class="space-y-1.5"
    >
      <li
        v-for="(id, i) in ranking"
        :key="id"
        class="flex items-center gap-2 rounded-md border border-default px-2 py-1"
      >
        <span class="w-5 text-sm tabular-nums text-muted">{{ i + 1 }}</span>
        <span class="min-w-0 flex-1 text-sm">{{ labelOf(id) }}</span>
        <IconButton
          icon="i-lucide-arrow-up"
          size="sm"
          :label="t('forms.screens.fill.rank-up', { name: labelOf(id) })"
          :disabled="i === 0"
          @click="rank(i, -1)"
        />
        <IconButton
          icon="i-lucide-arrow-down"
          size="sm"
          :label="t('forms.screens.fill.rank-down', { name: labelOf(id) })"
          :disabled="i === ranking.length - 1"
          @click="rank(i, 1)"
        />
      </li>
    </ol>
    <URadioGroup
      v-else-if="q.type === 'yesno'"
      orientation="horizontal"
      :model-value="typeof model === 'boolean' ? String(model) : undefined"
      :items="[{ value: 'true', label: t('forms.screens.logic.yes') }, { value: 'false', label: t('forms.screens.logic.no') }]"
      @update:model-value="model = $event === 'true'"
    />
    <div
      v-else-if="q.type === 'rating' || q.type === 'scale'"
      class="inline-block max-w-full"
    >
      <div
        class="flex flex-wrap gap-1"
        role="radiogroup"
      >
        <UButton
          v-for="n in steps"
          :key="n"
          :label="q.type === 'scale' ? String(n) : undefined"
          :icon="q.type === 'rating' ? 'i-lucide-star' : undefined"
          :aria-label="q.type === 'rating' ? t('forms.screens.fill.stars', { count: n }) : undefined"
          role="radio"
          :aria-checked="model === n"
          size="sm"
          :color="(q.type === 'rating' ? typeof model === 'number' && n <= model : model === n) ? 'primary' : 'neutral'"
          :variant="(q.type === 'rating' ? typeof model === 'number' && n <= model : model === n) ? 'solid' : 'outline'"
          @click="model = model === n ? undefined : n"
        />
      </div>
      <p
        v-if="q.type === 'scale' && (q.scale?.minLabel || q.scale?.maxLabel)"
        class="mt-1 flex justify-between text-xs text-muted"
      >
        <span>{{ q.scale?.minLabel }}</span><span>{{ q.scale?.maxLabel }}</span>
      </p>
    </div>
    <div
      v-else-if="q.type === 'address'"
      class="space-y-2"
    >
      <label
        v-for="part in ADDRESS"
        :key="part"
        class="block space-y-1"
      >
        <span class="text-sm text-muted">{{ t(`forms.screens.fill.address.${part}`) }}</span>
        <UInput
          :class="part === 'postcode' ? 'w-40' : ''"
          :model-value="address[part] ?? ''"
          :autocomplete="autocompleteOf(part)"
          @update:model-value="setAddress(part, String($event))"
        />
      </label>
    </div>
    <UCheckbox
      v-else-if="q.type === 'consent'"
      :model-value="model === true"
      :label="formsQuestionName(q)"
      :description="q.help"
      :required="required"
      @update:model-value="model = $event === true ? true : undefined"
    />
    <FormsFillRecord
      v-else-if="q.type === 'record' && q.source"
      v-model="model"
      :question="q"
    />
    <p
      v-else
      class="rounded-md border border-dashed border-default px-3 py-2 text-sm text-muted"
    >
      {{ t(q.type === 'file' ? 'forms.screens.fill.file-later' : 'forms.screens.fill.record-no-source') }}
    </p>
    <UInput
      v-if="otherChosen"
      class="mt-2"
      :model-value="other ?? ''"
      :placeholder="t('forms.screens.fill.other')"
      :aria-label="t('forms.screens.fill.other')"
      @update:model-value="emit('update:other', String($event))"
    />
  </UFormField>
</template>
