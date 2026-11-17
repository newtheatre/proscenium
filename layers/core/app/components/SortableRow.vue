<!-- A RecordListItem that can be dragged inside a SortableList. It takes the item's props and
     slots as they are; put the handle (an element with `data-drag-handle`) in the `leading` slot.
     `id` is the row's key and `index` its place in the list. -->
<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { useSortable } from '@dnd-kit/vue/sortable'

const props = defineProps<{ id: string, index: number, to?: string, icon?: string, name?: string, description?: string, muted?: boolean }>()
const row = ref<ComponentPublicInstance | null>(null)
const handle = shallowRef<HTMLElement | null>(null)
const { isDragging } = useSortable({
  id: () => props.id,
  index: () => props.index,
  element: row,
  handle,
})
onMounted(() => {
  handle.value = (row.value?.$el as HTMLElement | undefined)?.querySelector<HTMLElement>('[data-drag-handle]') ?? null
})
</script>

<template>
  <RecordListItem
    ref="row"
    :to="to"
    :icon="icon"
    :name="name"
    :description="description"
    :muted="muted"
    :class="isDragging && 'opacity-60'"
  >
    <template #leading>
      <slot name="leading" />
    </template>
    <slot />
  </RecordListItem>
</template>
