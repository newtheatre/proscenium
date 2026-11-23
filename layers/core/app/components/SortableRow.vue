<!-- A RecordListItem that can be dragged inside a SortableList. It takes the item's props and
     slots as they are; put the handle (an element with `data-drag-handle`) in the `leading` slot.
     `id` is the row's key and `index` its place in the list. Every slot of the item passes through
     (`name`, `description`, `below`, `trailing`), so a row can hold an inline rename or a short form:
     only the handle drags, and fields in the row take the pointer and the keyboard as usual. -->
<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { useSortable } from '@dnd-kit/vue/sortable'

const props = defineProps<{ id: string, index: number, to?: string, icon?: string, name?: string, description?: string, muted?: boolean, label?: string, align?: 'center' | 'start' }>()
const row = ref<ComponentPublicInstance | null>(null)
const handle = shallowRef<HTMLElement | null>(null)
const { isDragging } = useSortable({
  id: () => props.id,
  index: () => props.index,
  element: row,
  handle,
})
// Found again after each update: a row that redraws (an inline rename opening) gets a new handle element.
const find = () => { handle.value = (row.value?.$el as HTMLElement | undefined)?.querySelector<HTMLElement>('[data-drag-handle]') ?? null }
onMounted(find)
onUpdated(find)
</script>

<template>
  <RecordListItem
    ref="row"
    :to="to"
    :icon="icon"
    :name="name"
    :description="description"
    :muted="muted"
    :label="label"
    :align="align"
    :class="isDragging && 'opacity-60'"
  >
    <template
      v-for="(_, slot) in $slots"
      :key="slot"
      #[slot]
    >
      <slot :name="slot" />
    </template>
  </RecordListItem>
</template>
