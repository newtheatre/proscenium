<!-- The Columns control (UI-11): ticks optional columns on and off. A column marked `always`
     cannot be hidden. The choice is kept on this device for each list, not in the address, because
     it changes how rows look and not which rows. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const props = defineProps<{ columns: Record<string, { label: string, always?: boolean }>, hidden: string[] }>()
const emit = defineEmits<{ toggle: [key: string, shown: boolean] }>()
const { t } = useT()

const items = computed<DropdownMenuItem[]>(() => Object.entries(props.columns).map(([key, c]) => ({
  label: c.label,
  type: 'checkbox' as const,
  checked: !props.hidden.includes(key),
  disabled: c.always,
  onUpdateChecked: (shown: boolean) => emit('toggle', key, shown),
  onSelect: (e: Event) => e.preventDefault(),
})))
const optional = computed(() => Object.values(props.columns).some(c => !c.always))
</script>

<template>
  <UDropdownMenu
    v-if="optional"
    :items="items"
  >
    <UButton
      color="neutral"
      variant="outline"
      icon="i-lucide-columns-3"
      :label="t('core.list.columns')"
    />
  </UDropdownMenu>
</template>
