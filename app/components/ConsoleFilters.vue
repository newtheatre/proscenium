<script setup lang="ts">
import { operatorsOf, saysOperator } from '#shared/utils/list-filters'
import type { FilterCondition, FilterField, FilterOperator, FilterOption, ListSpec } from '#shared/utils/list-filters'
import type { ListSort } from '~/composables/useListQuery'

// The builder every console list shares (K-129 criterion 3, 0032): one condition per declared
// field, the control matching the kind, rendered inside AdminToolbar's filters slot.

const props = defineProps<{
  spec: ListSpec
  conditions: FilterCondition[]
  sort: ListSort
  // Labels for a searchable list or a reference whose options are only known at runtime.
  options?: Record<string, FilterOption[]>
}>()

const emit = defineEmits<{
  set: [key: string, condition: FilterCondition | null]
  sort: [sort: ListSort]
}>()

interface Draft {
  operator: FilterOperator | ''
  values: string[]
}

const drafts = reactive<Record<string, Draft>>({})

// The URL is the truth: a chip cleared or a page returned to resets what the builder shows.
watch(() => props.conditions, (conditions) => {
  for (const field of props.spec.fields) {
    const held = conditions.find(condition => condition.key === field.key)
    drafts[field.key] = held ? { operator: held.operator, values: [...held.values] } : { operator: '', values: [] }
  }
}, { immediate: true, deep: true })

const capitalise = (words: string): string => words.charAt(0).toUpperCase() + words.slice(1)

const operatorItems = (field: FilterField) => [
  { label: 'Any', value: '' },
  ...operatorsOf(field).map(operator => ({ label: capitalise(saysOperator(field.kind, operator)), value: operator })),
]

const YES_OR_NO = [
  { label: 'Any', value: '' },
  { label: 'Yes', value: 'true' },
  { label: 'No', value: 'false' },
]

const optionsFor = (field: FilterField): FilterOption[] => [...(field.options ?? props.options?.[field.key] ?? [])]

const wanted = (operator: FilterOperator | ''): number | undefined =>
  operator === '' || operator === 'empty' ? 0 : operator === 'between' ? 2 : operator === 'any' ? undefined : 1

// A condition is sent once it is whole; a half-typed range asks the server nothing.
function commit(field: FilterField): void {
  const draft = drafts[field.key]!
  if (draft.operator === '') {
    emit('set', field.key, null)
    return
  }
  const values = draft.values.filter(value => value !== '')
  const count = wanted(draft.operator)
  if (count === undefined ? values.length === 0 : values.length !== count) return
  emit('set', field.key, { key: field.key, operator: draft.operator, values })
}

function chooseOperator(field: FilterField, operator: FilterOperator | ''): void {
  const draft = drafts[field.key]!
  const count = wanted(operator)
  draft.operator = operator
  draft.values = count === 0 ? [] : count === 1 ? draft.values.slice(0, 1) : count === 2 ? [draft.values[0] ?? '', draft.values[1] ?? ''] : draft.values
  commit(field)
}

function chooseYesOrNo(field: FilterField, value: string): void {
  drafts[field.key] = value === '' ? { operator: '', values: [] } : { operator: 'is', values: [value] }
  commit(field)
}

function setValue(field: FilterField, index: number, value: string | number | null | undefined): void {
  const draft = drafts[field.key]!
  draft.values[index] = value === null || value === undefined ? '' : String(value)
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
      :data-test="`filter-${field.key}`"
    >
      <USelect
        v-if="field.kind === 'yes-no'"
        :model-value="drafts[field.key]?.operator ? drafts[field.key]!.values[0] : ''"
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
          :model-value="drafts[field.key]?.operator ?? ''"
          :items="operatorItems(field)"
          value-key="value"
          class="w-full"
          :data-test="`filter-${field.key}-operator`"
          @update:model-value="(operator: string) => chooseOperator(field, operator as FilterOperator | '')"
        />

        <template v-if="drafts[field.key]?.operator && drafts[field.key]!.operator !== 'empty'">
          <template v-if="field.kind === 'list' && drafts[field.key]!.operator !== 'any'">
            <USelect
              :model-value="drafts[field.key]!.values[0] ?? ''"
              :items="optionsFor(field)"
              value-key="value"
              placeholder="Choose one"
              class="w-full"
              :data-test="`filter-${field.key}-value`"
              @update:model-value="(value: string) => setValue(field, 0, value)"
            />
          </template>

          <template v-else-if="field.kind === 'list' || isMenu(field)">
            <USelectMenu
              v-if="drafts[field.key]!.operator === 'any'"
              :model-value="drafts[field.key]!.values"
              :items="optionsFor(field)"
              value-key="value"
              multiple
              placeholder="Choose some"
              class="w-full"
              :data-test="`filter-${field.key}-value`"
              @update:model-value="(values: string[]) => setValues(field, values)"
            />
            <USelectMenu
              v-else
              :model-value="drafts[field.key]!.values[0]"
              :items="optionsFor(field)"
              value-key="value"
              placeholder="Choose one"
              class="w-full"
              :data-test="`filter-${field.key}-value`"
              @update:model-value="(value: string) => setValue(field, 0, value)"
            />
          </template>

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
              :min="drafts[field.key]!.values[0] || undefined"
              :data-test="`filter-${field.key}-to`"
              @update:model-value="value => setValue(field, 1, value)"
            />
          </template>

          <template v-else-if="field.kind === 'number-range'">
            <UInputNumber
              :model-value="drafts[field.key]!.values[0] ? Number(drafts[field.key]!.values[0]) : undefined"
              class="w-full"
              :data-test="`filter-${field.key}-value`"
              @update:model-value="value => setValue(field, 0, value)"
            />
            <UInputNumber
              v-if="drafts[field.key]!.operator === 'between'"
              :model-value="drafts[field.key]!.values[1] ? Number(drafts[field.key]!.values[1]) : undefined"
              class="w-full"
              :data-test="`filter-${field.key}-to`"
              @update:model-value="value => setValue(field, 1, value)"
            />
          </template>
        </template>
      </div>
    </UFormField>
  </div>
</template>
