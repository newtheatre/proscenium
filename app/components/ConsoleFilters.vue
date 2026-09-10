<script setup lang="ts" generic="S extends ListSpec">
import { encodeCondition, operatorsOf, parseCondition, saysOperator, valuesWanted } from '#shared/utils/list-filters'
import type { FieldKey, FilterCondition, FilterField, FilterOperator, FilterOption, ListSpec } from '#shared/utils/list-filters'
import type { ListSort } from '~/composables/useListQuery'

// The builder every console list shares (K-129 criterion 3, 0032): one condition per declared
// field, the control matching the kind, rendered inside AdminToolbar's filters slot.

const props = defineProps<{
  spec: S
  conditions: FilterCondition[]
  sort: ListSort
  // Labels for a searchable list or a reference whose options are only known at runtime.
  options?: Record<string, FilterOption[]>
}>()

const emit = defineEmits<{
  set: [key: FieldKey<S>, condition: FilterCondition | null]
  sort: [sort: ListSort]
}>()

// A select item may not carry an empty value, so "no condition" is a word of its own.
const UNSET = 'unset'

interface Draft {
  operator: FilterOperator | typeof UNSET
  values: string[]
}

const drafts = reactive<Record<string, Draft>>({})
const issues = reactive<Record<string, string | undefined>>({})

const encodedOf = (key: string): string => {
  const held = props.conditions.find(condition => condition.key === key)
  return held ? encodeCondition(held) : ''
}
const known: Record<string, string> = {}

// The URL is the truth for a field whose condition changed there; a draft being built on another
// field survives the write, because only the changed keys are reset.
watch(() => props.conditions.map(encodeCondition).join('&'), () => {
  for (const field of props.spec.fields) {
    const encoded = encodedOf(field.key)
    if (known[field.key] === encoded && drafts[field.key]) continue
    known[field.key] = encoded
    const held = props.conditions.find(condition => condition.key === field.key)
    drafts[field.key] = held ? { operator: held.operator, values: [...held.values] } : { operator: UNSET, values: [] }
    issues[field.key] = undefined
  }
}, { immediate: true })

const capitalise = (words: string): string => words.charAt(0).toUpperCase() + words.slice(1)

const operatorItems = computed(() => Object.fromEntries(props.spec.fields.map(field => [field.key, [
  { label: 'Any', value: UNSET },
  ...operatorsOf(field).map(operator => ({ label: capitalise(saysOperator(field.kind, operator)), value: operator })),
]])))

const YES_OR_NO = [
  { label: 'Any', value: UNSET },
  { label: 'Yes', value: 'true' },
  { label: 'No', value: 'false' },
]

const options = computed(() => Object.fromEntries(props.spec.fields.map(field =>
  [field.key, [...(field.options ?? props.options?.[field.key] ?? [])]])))

// A condition is sent once it is whole and would parse; a half-typed range asks the server
// nothing, and a backwards one says so under the field rather than vanishing.
function commit(field: FilterField): void {
  const draft = drafts[field.key]!
  issues[field.key] = undefined
  if (draft.operator === UNSET) {
    emit('set', field.key as FieldKey<S>, null)
    return
  }
  const values = draft.values.filter(value => value !== '')
  const wanted = valuesWanted(draft.operator)
  if (wanted === undefined ? values.length === 0 : values.length !== wanted) return
  const parsed = parseCondition(field, encodeCondition({ key: field.key, operator: draft.operator, values }))
  if ('issue' in parsed) {
    issues[field.key] = capitalise(parsed.issue)
    return
  }
  emit('set', field.key as FieldKey<S>, parsed.condition)
}

function chooseOperator(field: FilterField, operator: string): void {
  const draft = drafts[field.key]!
  const next = operator as FilterOperator | typeof UNSET
  const wanted = next === UNSET ? 0 : valuesWanted(next)
  draft.operator = next
  draft.values = wanted === 0 ? [] : wanted === 1 ? draft.values.slice(0, 1) : wanted === 2 ? [draft.values[0] ?? '', draft.values[1] ?? ''] : draft.values
  commit(field)
}

function chooseYesOrNo(field: FilterField, value: string): void {
  drafts[field.key] = value === UNSET ? { operator: UNSET, values: [] } : { operator: 'is', values: [value] }
  commit(field)
}

function hold(field: FilterField, index: number, value: string | number | null | undefined): void {
  drafts[field.key]!.values[index] = value === null || value === undefined ? '' : String(value)
}

function setValue(field: FilterField, index: number, value: string | number | null | undefined): void {
  hold(field, index, value)
  commit(field)
}

function setValues(field: FilterField, values: string[]): void {
  drafts[field.key]!.values = values
  commit(field)
}

// A person or a room is picked one at a time; the picks collect as tags the reader can remove.
const names = reactive<Record<string, string>>({})

function addPick(field: FilterField, pick: { id: string, name: string } | null): void {
  if (!pick) return
  names[pick.id] = pick.name
  const draft = drafts[field.key]!
  if (draft.operator === 'any') {
    if (!draft.values.includes(pick.id)) setValues(field, [...draft.values, pick.id])
  }
  else {
    setValues(field, [pick.id])
  }
}

const isReference = (field: FilterField): boolean => field.kind === 'person' || field.kind === 'room'
const isMenu = (field: FilterField): boolean => field.kind === 'search-list' || field.kind === 'show'
const building = (field: FilterField): boolean => {
  const operator = drafts[field.key]?.operator
  return operator !== undefined && operator !== UNSET && operator !== 'empty'
}

const sortItems = computed(() => props.spec.sort.fields.map(field => ({ label: field.label, value: field.key })))
const directionItems = [
  { label: 'Ascending', value: 'asc' },
  { label: 'Descending', value: 'desc' },
]
</script>

<template>
  <div
    class="space-y-4"
    data-test="console-filters"
  >
    <UFormField
      v-if="spec.sort.fields.length > 1"
      label="Sort by"
    >
      <div class="flex gap-2">
        <USelect
          :model-value="sort.key"
          :items="sortItems"
          value-key="value"
          class="min-w-0 flex-1"
          data-test="list-sort"
          @update:model-value="(key: string) => emit('sort', { key, direction: sort.direction })"
        />
        <USelect
          :model-value="sort.direction"
          :items="directionItems"
          value-key="value"
          class="w-36"
          data-test="list-direction"
          @update:model-value="(direction: string) => emit('sort', { key: sort.key, direction: direction === 'desc' ? 'desc' : 'asc' })"
        />
      </div>
    </UFormField>

    <UFormField
      v-for="field in spec.fields"
      :key="field.key"
      :label="field.label"
      :error="issues[field.key]"
      :data-test="`filter-${field.key}`"
    >
      <USelect
        v-if="field.kind === 'yes-no'"
        :model-value="drafts[field.key]?.operator === 'is' ? drafts[field.key]!.values[0] : UNSET"
        :items="YES_OR_NO"
        value-key="value"
        class="w-full"
        :data-test="`filter-${field.key}-value`"
        @update:model-value="(value: string) => chooseYesOrNo(field, value)"
      />

      <div
        v-else
        class="space-y-2"
      >
        <USelect
          :model-value="drafts[field.key]?.operator ?? UNSET"
          :items="operatorItems[field.key]"
          value-key="value"
          class="w-full"
          :data-test="`filter-${field.key}-operator`"
          @update:model-value="(operator: string) => chooseOperator(field, operator)"
        />

        <template v-if="building(field)">
          <!-- A short closed list is a select; a long or searchable one is a menu (0032). -->
          <USelect
            v-if="field.kind === 'list' && drafts[field.key]!.operator !== 'any'"
            :model-value="drafts[field.key]!.values[0] || undefined"
            :items="options[field.key]"
            value-key="value"
            placeholder="Choose one"
            class="w-full"
            :data-test="`filter-${field.key}-value`"
            @update:model-value="(value: string) => setValue(field, 0, value)"
          />

          <USelectMenu
            v-else-if="(field.kind === 'list' || isMenu(field)) && drafts[field.key]!.operator === 'any'"
            :model-value="drafts[field.key]!.values"
            :items="options[field.key]"
            value-key="value"
            multiple
            placeholder="Choose some"
            class="w-full"
            :data-test="`filter-${field.key}-value`"
            @update:model-value="(values: string[]) => setValues(field, values)"
          />

          <USelectMenu
            v-else-if="isMenu(field)"
            :model-value="drafts[field.key]!.values[0]"
            :items="options[field.key]"
            value-key="value"
            placeholder="Choose one"
            class="w-full"
            :data-test="`filter-${field.key}-value`"
            @update:model-value="(value: string) => setValue(field, 0, value)"
          />

          <template v-else-if="isReference(field)">
            <UInputTags
              v-if="drafts[field.key]!.operator === 'any' && drafts[field.key]!.values.length"
              :model-value="drafts[field.key]!.values"
              :display-value="(id: string) => names[id] ?? 'Chosen'"
              readonly
              class="w-full"
              @update:model-value="(values: string[]) => setValues(field, values)"
            />
            <PersonPicker
              v-if="field.kind === 'person'"
              :data-test="`filter-${field.key}-value`"
              @chosen="pick => addPick(field, pick)"
            />
            <SpacePicker
              v-else
              :data-test="`filter-${field.key}-value`"
              @chosen="pick => addPick(field, pick)"
            />
          </template>

          <template v-else-if="field.kind === 'date-range'">
            <DateField
              :model-value="drafts[field.key]!.values[0] || undefined"
              :data-test="`filter-${field.key}-value`"
              @update:model-value="value => setValue(field, 0, value)"
            />
            <DateField
              v-if="drafts[field.key]!.operator === 'between'"
              :model-value="drafts[field.key]!.values[1] || undefined"
              :data-test="`filter-${field.key}-to`"
              @update:model-value="value => setValue(field, 1, value)"
            />
          </template>

          <!-- A number is sent when the reader leaves the box or presses enter, not per keystroke. -->
          <template v-else-if="field.kind === 'number-range'">
            <UInputNumber
              :model-value="drafts[field.key]!.values[0] ? Number(drafts[field.key]!.values[0]) : undefined"
              class="w-full"
              :data-test="`filter-${field.key}-value`"
              @update:model-value="value => hold(field, 0, value)"
              @change="commit(field)"
            />
            <UInputNumber
              v-if="drafts[field.key]!.operator === 'between'"
              :model-value="drafts[field.key]!.values[1] ? Number(drafts[field.key]!.values[1]) : undefined"
              class="w-full"
              :data-test="`filter-${field.key}-to`"
              @update:model-value="value => hold(field, 1, value)"
              @change="commit(field)"
            />
          </template>
        </template>
      </div>
    </UFormField>
  </div>
</template>
