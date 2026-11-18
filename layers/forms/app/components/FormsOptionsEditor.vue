<!-- A choice's options, one row each. An option keeps its id for the life of the question, so
     renaming one never loses the answers already given to it, and a removed id is never used again. -->
<script setup lang="ts">
import { DragDropProvider } from '@dnd-kit/vue'
import { move } from '@dnd-kit/helpers'
import { nextOptionId } from '../../shared/builder/edit'
import type { Option, Question } from '../../shared/engine'

const props = defineProps<{ question: Question }>()
const emit = defineEmits<{ change: [options: Option[], merge?: string] }>()
const { t } = useT()
const options = computed(() => props.question.options ?? [])
const rows = useTemplateRef<HTMLElement>('rows')

const rename = (id: string, label: string) => emit('change', options.value.map(o => o.id === id ? { ...o, label } : o), `option:${props.question.id}:${id}`)
const remove = (id: string) => emit('change', options.value.filter(o => o.id !== id))
async function add() {
  emit('change', [...options.value, { id: nextOptionId(props.question), label: '' }])
  await nextTick()
  rows.value?.querySelector<HTMLInputElement>('[data-option]:last-child input')?.focus()
}
function shift(index: number, by: number) {
  const next = [...options.value]
  const [o] = next.splice(index, 1)
  next.splice(index + by, 0, o!)
  emit('change', next)
}
/** Pasting several lines into one row makes a row of each. */
function paste(event: ClipboardEvent, id: string) {
  const lines = (event.clipboardData?.getData('text') ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return
  event.preventDefault()
  const next: Option[] = []
  let scratch: Question = props.question
  for (const o of options.value) {
    if (o.id !== id) {
      next.push(o)
      continue
    }
    next.push({ ...o, label: lines[0]! })
    for (const label of lines.slice(1)) {
      const made = { id: nextOptionId(scratch), label }
      scratch = { ...scratch, options: [...(scratch.options ?? []), made] }
      next.push(made)
    }
  }
  emit('change', next)
}
</script>

<template>
  <DragDropProvider @drag-end="(event: any) => !event.canceled && emit('change', move(options, event))">
    <div
      ref="rows"
      class="space-y-1.5"
    >
      <FormsOptionRow
        v-for="(option, i) in options"
        :key="option.id"
        :option="option"
        :index="i"
        :last="i === options.length - 1"
        :removable="options.length > 1"
        @rename="rename(option.id, $event)"
        @remove="remove(option.id)"
        @shift="shift(i, $event)"
        @enter="add"
        @paste="paste($event, option.id)"
      />
    </div>
  </DragDropProvider>
  <UButton
    class="mt-2"
    :label="t('forms.screens.options.add')"
    icon="i-lucide-plus"
    size="sm"
    color="neutral"
    variant="soft"
    @click="add"
  />
</template>
