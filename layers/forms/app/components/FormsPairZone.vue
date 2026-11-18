<!-- The right-hand half of a question while another is being dragged: dropping there puts the two
     side by side. -->
<script setup lang="ts">
import { useDroppable } from '@dnd-kit/vue'
import { CollisionPriority } from '@dnd-kit/abstract'
import { pointerIntersection } from '@dnd-kit/collision'

const props = defineProps<{ itemId: string }>()
const { t } = useT()
const el = useTemplateRef<HTMLElement>('el')
const { isDropTarget } = useDroppable({ id: () => `pair:${props.itemId}`, element: el, accept: 'question', collisionPriority: CollisionPriority.High, collisionDetector: () => pointerIntersection })
</script>

<template>
  <div
    ref="el"
    class="absolute inset-y-0 right-0 z-10 w-1/2 rounded-r-lg"
    :class="isDropTarget ? 'bg-primary/10 ring-2 ring-primary' : ''"
  >
    <UBadge
      v-if="isDropTarget"
      color="primary"
      size="sm"
      class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
      :label="t('forms.screens.builder.pair')"
    />
  </div>
</template>
