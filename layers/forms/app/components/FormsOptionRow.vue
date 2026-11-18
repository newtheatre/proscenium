<!-- One option: a grip to drag it by, its words, and its remove button. Alt with an arrow key moves it. -->
<script setup lang="ts">
import { useSortable } from '@dnd-kit/vue/sortable'
import type { Option } from '../../shared/engine'

const props = defineProps<{ option: Option, index: number, last: boolean, removable: boolean }>()
const emit = defineEmits<{ rename: [label: string], remove: [], shift: [by: number], enter: [], paste: [event: ClipboardEvent] }>()
const { t } = useT()
const el = useTemplateRef<HTMLElement>('el')
const handle = useTemplateRef<HTMLElement>('handle')
const { isDragging } = useSortable({ id: () => props.option.id, index: () => props.index, element: el, handle })
function key(event: KeyboardEvent) {
  if (!event.altKey) return
  if (event.key === 'ArrowUp' && props.index > 0) emit('shift', -1)
  else if (event.key === 'ArrowDown' && !props.last) emit('shift', 1)
  else return
  event.preventDefault()
}
</script>

<template>
  <div
    ref="el"
    data-option
    class="flex items-center gap-1"
    :class="isDragging ? 'opacity-50' : ''"
  >
    <span
      ref="handle"
      class="cursor-grab touch-none text-dimmed hover:text-default"
      :aria-label="t('forms.screens.builder.drag')"
    >
      <UIcon
        name="i-lucide-grip-vertical"
        class="block"
      />
    </span>
    <UInput
      class="min-w-0 flex-1"
      :model-value="option.label"
      size="sm"
      :placeholder="t('forms.screens.options.placeholder', { n: index + 1 })"
      :aria-label="t('forms.screens.options.label', { n: index + 1 })"
      @update:model-value="emit('rename', String($event))"
      @keydown="key"
      @keydown.enter.prevent="emit('enter')"
      @paste="emit('paste', $event)"
    />
    <IconButton
      icon="i-lucide-x"
      size="sm"
      :label="t('forms.screens.options.remove')"
      :disabled="!removable"
      @click="emit('remove')"
    />
  </div>
</template>
