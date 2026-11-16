<!-- The Sort control (UI-11): always says how the list is sorted, and lists every sort the list
     declares, whether or not it is a column on screen, then the two directions. On a phone, where
     there are no headings, it is the only sort control. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { directionWords, type SortDef } from '../../shared/list'

const props = defineProps<{ sorts: Record<string, SortDef>, sort?: string, order: 'asc' | 'desc' }>()
const emit = defineEmits<{ change: [sort: string, order: 'asc' | 'desc'] }>()
const { t } = useT()

const current = computed(() => props.sort ? props.sorts[props.sort] : undefined)
const label = computed(() => current.value
  ? t('core.list.sort-by', { sort: current.value.label, order: directionWords(current.value.type, props.order).short })
  : t('core.list.sort'))

const items = computed<DropdownMenuItem[][]>(() => [
  Object.entries(props.sorts).map(([key, def]) => ({
    label: def.label,
    type: 'checkbox' as const,
    checked: props.sort === key,
    onUpdateChecked: () => emit('change', key, props.sort === key ? props.order : def.natural ?? 'asc'),
    onSelect: (e: Event) => e.preventDefault(),
  })),
  (['asc', 'desc'] as const).map(order => ({
    label: directionWords(current.value?.type ?? 'text', order).short,
    type: 'checkbox' as const,
    checked: props.order === order,
    disabled: !props.sort,
    onUpdateChecked: () => props.sort && emit('change', props.sort, order),
    onSelect: (e: Event) => e.preventDefault(),
  })),
])
</script>

<template>
  <UDropdownMenu :items="items">
    <UButton
      color="neutral"
      variant="outline"
      icon="i-lucide-arrow-up-down"
      :label="label"
    />
  </UDropdownMenu>
</template>
