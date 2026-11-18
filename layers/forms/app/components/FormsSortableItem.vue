<!-- A list item that can be dragged into a new place inside a DragDropProvider, picked up by the
     element with `data-drag-handle` inside it. The list keeps arrow buttons beside the handle, so
     the order never depends on dragging. -->
<script setup lang="ts">
import { useSortable } from '@dnd-kit/vue/sortable'

const props = defineProps<{ id: string, index: number }>()
const el = useTemplateRef<HTMLElement>('el')
const handle = shallowRef<HTMLElement | null>(null)
const { isDragging } = useSortable({ id: () => props.id, index: () => props.index, element: el, handle })
onMounted(() => { handle.value = el.value?.querySelector<HTMLElement>('[data-drag-handle]') ?? null })
</script>

<template>
  <li
    ref="el"
    :class="isDragging ? 'opacity-60' : ''"
  >
    <slot />
  </li>
</template>
