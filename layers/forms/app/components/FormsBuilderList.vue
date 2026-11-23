<!-- One list of cards on the canvas: a page's items, or a repeating group's questions. It is a place
     to drop even when empty. -->
<script setup lang="ts">
import { useDroppable } from '@dnd-kit/vue'
import { CollisionPriority } from '@dnd-kit/abstract'
import type { QuestionType } from '../../shared/engine'

const props = defineProps<{ listKey: string, accept: string[], empty: string }>()
defineEmits<{ add: [event: { kind: QuestionType | 'content' | 'group', into?: string }] }>()
const canvas = inject(FORMS_CANVAS)!
const items = computed(() => canvas.board.value[props.listKey] ?? [])
const el = useTemplateRef<HTMLElement>('el')
// A group's own list beats the group's card, so a question dragged over it lands inside the group.
const { isDropTarget } = useDroppable({ id: () => props.listKey, element: el, accept: props.accept, collisionPriority: props.listKey.startsWith('group:') ? CollisionPriority.High : CollisionPriority.Low })
</script>

<template>
  <div
    ref="el"
    class="flex flex-col gap-3 rounded-lg"
    :class="isDropTarget && !items.length ? 'ring-2 ring-primary/50' : ''"
  >
    <FormsBuilderItem
      v-for="(item, i) in items"
      :key="item.id"
      :item="item"
      :index="i"
      :count="items.length"
      :list-key="listKey"
      :accept="accept"
      @add="$emit('add', $event)"
    />
    <div
      v-if="!items.length"
      class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted"
    >
      <p>{{ empty }}</p>
      <slot name="empty" />
    </div>
  </div>
</template>
