<!-- The Filters button and its panel (UI-11): a popover on a laptop, a drawer from the bottom on a
     phone. Each filter is a labelled field of its own kind; the list updates as each field changes
     and the panel ends with "Clear all" and "Done". The panel is controlled so a chip can open it. -->
<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { UDrawer, UPopover } from '#components'
import type { FilterDef, ListOption } from '../../shared/list'

const props = defineProps<{
  /** The filters the viewer may use, in order. */
  filters: Record<string, FilterDef>
  /** The address's words for each filter that is on. */
  values: Record<string, string>
  /** How many filters are on, for the button. */
  count: number
}>()
const emit = defineEmits<{ change: [name: string, value: string], clear: [] }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useT()
const phone = useMediaQuery('(max-width: 639px)')
const container = computed(() => (phone.value ? UDrawer : UPopover))
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
let lookupTimer: ReturnType<typeof setTimeout> | undefined
function searchLookup(name: string, term: string) {
  lookupTerm[name] = term
  clearTimeout(lookupTimer)
  lookupTimer = setTimeout(async () => {
    const route = props.filters[name]?.lookup?.search
    if (!route) return
    lookupBusy[name] = true
    try {
      const found = await $api<{ rows: ListOption[] }>(route, { query: { q: term, size: 25 } })
      lookupItems[name] = found.rows
    }
    catch { lookupItems[name] = [] }
    finally { lookupBusy[name] = false }
  }, 250) // not-policy: a typing pause
}
onBeforeUnmount(() => clearTimeout(lookupTimer))

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

const label = computed(() => props.count ? t('core.list.filters-on', { count: props.count }) : t('core.list.filters'))
</script>

<template>
  <component
    :is="container"
    v-model:open="open"
    v-bind="phone ? { direction: 'bottom', title: t('core.list.filters'), description: t('core.list.filters-description') } : {}"
  >
    <UButton
      color="neutral"
      variant="outline"
      icon="i-lucide-sliders-horizontal"
      :label="label"
      aria-haspopup="dialog"
    />
    <template #content>
      <div
        class="w-full space-y-4 p-4 sm:w-96"
        role="group"
        :aria-label="t('core.list.filters')"
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
            class="w-full"
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
            class="w-full"
            @update:model-value="setValue(name, String($event))"
          />

          <USelectMenu
            v-else-if="filters[name]!.kind === 'lookup'"
            :model-value="values[name]"
            :items="lookupItems[name] ?? []"
            :search-term="lookupTerm[name] ?? ''"
            :loading="lookupBusy[name]"
            value-key="value"
            ignore-filter
            class="w-full"
            :placeholder="t('core.list.any')"
            @update:search-term="searchLookup(name, $event)"
            @update:model-value="setValue(name, $event ? String($event) : '')"
          />

          <div
            v-else-if="filters[name]!.kind === 'dates'"
            class="space-y-2"
          >
            <div class="flex flex-wrap gap-1.5">
              <UButton
                v-for="p in filters[name]!.presets"
                :key="p.value"
                size="sm"
                color="neutral"
                :variant="values[name] === p.value ? 'solid' : 'outline'"
                :aria-pressed="values[name] === p.value"
                :label="p.label"
                @click="setValue(name, values[name] === p.value ? '' : p.value)"
              />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <UFormField :label="t('core.list.from')">
                <UInput
                  v-model="rangeOf(name).from"
                  type="date"
                  class="w-full"
                  @change="setRange(name)"
                />
              </UFormField>
              <UFormField :label="t('core.list.to')">
                <UInput
                  v-model="rangeOf(name).to"
                  type="date"
                  class="w-full"
                  @change="setRange(name)"
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

        <div class="flex items-center justify-between gap-2 border-t border-default pt-3">
          <UButton
            color="neutral"
            variant="link"
            :label="t('core.list.clear-all')"
            :disabled="!count"
            @click="emit('clear')"
          />
          <UButton
            :label="t('core.list.done')"
            @click="open = false"
          />
        </div>
      </div>
    </template>
  </component>
</template>
