<!-- The Filters button and its panel (UI-11): a popover on a laptop, a drawer from the bottom on a
     phone. Each filter is a labelled field of its own kind; the list updates as each field changes
     and the panel ends with "Clear all" and "Done". The panel is controlled so a chip can open it. -->
<script setup lang="ts">
import type { FilterDef, ListOption } from '../../shared/list'

const props = defineProps<{
  /** The filters the viewer may use, in order. */
  filters: Record<string, FilterDef>
  /** The address's words for each filter that is on. */
  values: Record<string, string>
  /** How many filters are on, for the button. */
  count: number
  /** What each lookup's chosen id is called, by filter. */
  lookupLabels?: Record<string, Record<string, string>>
}>()
const emit = defineEmits<{ change: [name: string, value: string], clear: [] }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useT()
const ANY = '__any' // a select item cannot have an empty value, so "Any" has its own

const names = computed(() => Object.keys(props.filters))
const setValue = (name: string, value: string | undefined | null) => emit('change', name, value && value !== ANY ? value : '')

const anyItem = computed<ListOption>(() => ({ value: ANY, label: t('core.list.any') }))
const withAny = (options: ListOption[] | undefined) => [anyItem.value, ...(options ?? [])]
const listOf = (name: string) => (props.values[name] ?? '').split(',').filter(Boolean)
const groupedItems = (def: FilterDef) => [
  [anyItem.value],
  ...(def.groups ?? []).map(g => [
    { type: 'label' as const, label: g.label },
    { value: g.value, label: t('core.list.all-of', { group: g.label }) },
    ...g.items.map(i => ({ value: `${g.value}.${i.value}`, label: i.label })),
  ]),
]

// A lookup holds an id only; the chip and the field show what it resolves to.
const lookupTerm = reactive<Record<string, string>>({})
const lookupItems = reactive<Record<string, ListOption[]>>({})
const lookupBusy = reactive<Record<string, boolean>>({})
const { $api } = useNuxtApp()
const lookupTimers: Record<string, ReturnType<typeof setTimeout>> = {}
function searchLookup(name: string, term: string) {
  lookupTerm[name] = term
  clearTimeout(lookupTimers[name])
  lookupTimers[name] = setTimeout(async () => {
    const route = props.filters[name]?.lookup?.search
    if (!route) return
    lookupBusy[name] = true
    try {
      // The other filters that are on go too, so a lookup can narrow to them (a show's performances).
      const others = Object.fromEntries(Object.entries(props.values).filter(([key]) => key !== name))
      const found = await $api<{ rows: ListOption[] }>(route, { query: { ...others, q: term, size: 25 } })
      lookupItems[name] = found.rows
    }
    catch { lookupItems[name] = [] }
    finally { lookupBusy[name] = false }
  }, 250) // not-policy: a typing pause
}
onBeforeUnmount(() => Object.values(lookupTimers).forEach(clearTimeout))
// The chosen option stays in the field's items, so the field names it before anything is searched.
function lookupOptions(name: string): ListOption[] {
  const items = lookupItems[name] ?? []
  const id = props.values[name]
  const label = id ? props.lookupLabels?.[name]?.[id] : undefined
  return id && label && !items.some(i => i.value === id) ? [{ value: id, label }, ...items] : items
}
// Opening the panel offers each lookup's nearest choices before anything is typed, again as other filters change.
watch([open, () => props.values], ([isOpen]) => {
  if (isOpen) for (const name of names.value) if (props.filters[name]?.kind === 'lookup') searchLookup(name, lookupTerm[name] ?? '')
})

// Dates: relative presets or a range of two days. The address keeps a preset relative.
const range = reactive<Record<string, { from: string, to: string }>>({})
function rangeOf(name: string) {
  const [from = '', to = ''] = /^\d{4}-/.test(props.values[name] ?? '') ? props.values[name]!.split('..') : []
  return range[name] ??= { from, to: to || from }
}
function setRange(name: string) {
  const r = rangeOf(name)
  if (r.from) setValue(name, r.to && r.to !== r.from ? `${r.from}..${r.to}` : r.from)
}
watch(() => props.values, () => { for (const name of names.value) if (!/^\d{4}-/.test(props.values[name] ?? '')) Reflect.deleteProperty(range, name) })
</script>

<template>
  <FilterPanel
    v-model:open="open"
    :count="count"
    @clear="emit('clear')"
  >
    <UFormField
      v-for="name in names"
      :key="name"
      :label="filters[name]!.label"
      :name="`filter-${name}`"
    >
      <USelect
        v-if="filters[name]!.kind === 'choice'"
        :model-value="values[name] || ANY"
        :items="withAny(filters[name]!.options)"
        value-key="value"
        @update:model-value="setValue(name, String($event))"
      />

      <UCheckboxGroup
        v-else-if="filters[name]!.kind === 'choices'"
        :model-value="listOf(name)"
        :items="filters[name]!.options"
        value-key="value"
        @update:model-value="setValue(name, ($event as string[]).join(','))"
      />

      <USelectMenu
        v-else-if="filters[name]!.kind === 'grouped'"
        :model-value="values[name] || ANY"
        :items="groupedItems(filters[name]!)"
        value-key="value"
        @update:model-value="setValue(name, String($event))"
      />

      <USelectMenu
        v-else-if="filters[name]!.kind === 'lookup'"
        :model-value="values[name]"
        :items="lookupOptions(name)"
        :search-term="lookupTerm[name] ?? ''"
        :loading="lookupBusy[name]"
        value-key="value"
        ignore-filter
        :placeholder="t('core.list.any')"
        @update:search-term="searchLookup(name, $event)"
        @update:model-value="setValue(name, $event ? String($event) : '')"
      />

      <div
        v-else-if="filters[name]!.kind === 'dates'"
        class="space-y-2"
      >
        <!-- Pressing the chosen one again clears it. -->
        <UToggleGroup
          :model-value="String(values[name] ?? '')"
          :items="filters[name]!.presets"
          size="sm"
          color="neutral"
          variant="outline"
          active-color="neutral"
          active-variant="solid"
          class="flex flex-wrap gap-1.5"
          :aria-label="filters[name]!.label"
          @update:model-value="setValue(name, ($event as string | undefined) ?? '')"
        />
        <div class="grid grid-cols-2 gap-2">
          <UFormField :label="t('core.list.from')">
            <FieldDate
              v-model="rangeOf(name).from"
              @update:model-value="setRange(name)"
            />
          </UFormField>
          <UFormField :label="t('core.list.to')">
            <FieldDate
              v-model="rangeOf(name).to"
              @update:model-value="setRange(name)"
            />
          </UFormField>
        </div>
      </div>

      <URadioGroup
        v-else-if="filters[name]!.kind === 'yes-no'"
        :model-value="values[name] || 'any'"
        :items="[{ value: 'any', label: t('core.list.any') }, { value: 'yes', label: t('core.list.yes') }, { value: 'no', label: t('core.list.no') }]"
        orientation="horizontal"
        @update:model-value="setValue(name, $event === 'any' ? '' : String($event))"
      />
    </UFormField>
  </FilterPanel>
</template>
