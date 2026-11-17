<!-- A RecordList whose rows can be dragged into a new order, with @dnd-kit/vue. Its rows are
     SortableRow, each given its `id` and its `index`. A row is picked up by its handle (an element
     with `data-drag-handle`): with a pointer or a finger by dragging, from the keyboard with Space
     or Enter, then the arrow keys, then Space or Enter again to drop or Escape to cancel. The list
     does not reorder anything itself: it says what moved with `reorder`, and the page puts its own
     array in the new order. Give the handle's own arrow-key and menu equivalents beside it, so the
     order never depends on dragging. -->
<script setup lang="ts">
import { DragDropProvider } from '@dnd-kit/vue'
import { isSortable } from '@dnd-kit/vue/sortable'

defineProps<{ label?: string }>()
const emit = defineEmits<{ reorder: [move: { id: string, from: number, to: number }] }>()

function onDragEnd(event: { canceled: boolean, operation: { source: unknown } }) {
  if (event.canceled) return
  const source = event.operation.source
  if (!isSortable(source as never)) return
  const { id, initialIndex, index } = source as unknown as { id: string | number, initialIndex: number, index: number }
  if (initialIndex === index) return
  emit('reorder', { id: String(id), from: initialIndex, to: index })
}
</script>

<template>
  <DragDropProvider @drag-end="onDragEnd">
    <RecordList :label="label">
      <slot />
    </RecordList>
  </DragDropProvider>
</template>
