<!-- A page in the outline. A card dragged onto it moves to the end of that page. -->
<script setup lang="ts">
import { useDroppable } from '@dnd-kit/vue'
import { CollisionPriority } from '@dnd-kit/abstract'
import { pointerIntersection } from '@dnd-kit/collision'
import type { Page } from '../../shared/engine'

const props = defineProps<{ page: Page, name: string, number: number, open: boolean, menu: unknown[][] }>()
defineEmits<{ open: [] }>()
const { t } = useT()
const builder = useBuilder()
const el = useTemplateRef<HTMLElement>('el')
const { isDropTarget } = useDroppable({ id: () => `outline:${props.page.id}`, element: el, accept: ['question', 'block'], collisionPriority: CollisionPriority.High, collisionDetector: () => pointerIntersection })
const ids = computed(() => [props.page.id, ...props.page.items.flatMap(i => i.kind === 'row' || i.kind === 'group' ? [i.id, ...i.items.map(q => q.id)] : [i.id])])
const wrong = computed(() => ids.value.some(id => builder.problemsAt.value.get(id)?.some(p => p.level === 'error')))
</script>

<template>
  <li
    ref="el"
    class="flex items-center gap-1 rounded-md"
    :class="isDropTarget && !open ? 'ring-2 ring-primary' : ''"
  >
    <UButton
      class="min-w-0 flex-1 justify-start"
      size="sm"
      color="neutral"
      :variant="open ? 'soft' : 'ghost'"
      :aria-current="open ? 'page' : undefined"
      @click="$emit('open')"
    >
      <span class="w-4 shrink-0 text-xs tabular-nums text-muted">{{ number }}</span>
      <span
        class="truncate"
        :class="page.title.trim() ? '' : 'text-muted'"
      >{{ name }}</span>
      <UIcon
        v-if="wrong"
        name="i-lucide-circle-alert"
        class="ms-auto shrink-0 text-error"
        :aria-label="t('forms.screens.problems.has')"
      />
    </UButton>
    <RowActions
      :items="menu as any"
      :label="t('forms.screens.builder.actions-for', { name })"
    />
  </li>
</template>
