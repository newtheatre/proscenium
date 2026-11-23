<!-- One card on the canvas: a question, two questions side by side, a block of text, or a repeating
     group with its own questions inside. Dragged by its grip; everything a drag can do is in its
     menu too, and is announced. -->
<script setup lang="ts">
import { useSortable } from '@dnd-kit/vue/sortable'
import { CollisionPriority } from '@dnd-kit/abstract'
import { dependents, duplicate, find, moveItem, removeItem, unpair } from '../../shared/builder/edit'
import type { Item, Question, QuestionType } from '../../shared/engine'

const props = defineProps<{ item: Item, index: number, count: number, listKey: string, accept: string[] }>()
const emit = defineEmits<{ add: [event: { kind: QuestionType | 'content' | 'group', into?: string }] }>()
const { t } = useT()
const builder = useBuilder()
const canvas = inject(FORMS_CANVAS)!
const { confirm } = useConfirm()
const { polite } = useAnnouncer()
const def = computed(() => builder.definition.value)

const el = useTemplateRef<HTMLElement>('el')
const handle = useTemplateRef<HTMLElement>('handle')
const type = computed(() => props.item.kind === 'question' ? 'question' : 'block')
const { isDragging } = useSortable({
  id: () => props.item.id,
  index: () => props.index,
  group: () => props.listKey,
  element: el,
  handle,
  type: type.value,
  accept: props.accept,
  collisionPriority: props.listKey.startsWith('group:') ? CollisionPriority.Highest : CollisionPriority.Normal,
})
const topLevel = computed(() => props.listKey.startsWith('page:'))
const pairable = computed(() => topLevel.value && props.item.kind === 'question' && canvas.dragging.value?.type === 'question' && canvas.dragging.value.id !== props.item.id)
const selected = (id: string) => builder.selected.value === id
const name = computed(() => props.item.kind === 'question' ? formsQuestionName(props.item) : props.item.kind === 'group' ? props.item.label.trim() || t('forms.screens.builder.untitled-group') : props.item.kind === 'content' ? t('forms.screens.palette.content') : t('forms.screens.builder.row'))

function shift(by: number) {
  const into = props.listKey.slice(props.listKey.indexOf(':') + 1)
  builder.apply(moveItem(def.value, props.item.id, into, props.index + by))
  polite(t('forms.screens.builder.moved', { name: name.value, position: props.index + by + 1, count: props.count }))
}
async function remove(id = props.item.id) {
  const readers = dependents(def.value, id).map((r) => {
    const found = find(def.value, r)
    return found?.kind === 'page' ? found.page.title || t('forms.screens.builder.a-page') : found && found.item.kind === 'question' ? formsQuestionName(found.item) : r
  })
  // Logic that reads a question is named before the question goes (FB-204).
  if (readers.length && !(await confirm({ verb: t('forms.screens.builder.remove'), thing: `"${name.value}"`, consequence: t('forms.screens.builder.remove-readers', { names: readers.map(r => `"${r}"`).join(', ') }) }))) return
  builder.apply(removeItem(def.value, id))
}
function copy() {
  const made = duplicate(def.value, props.item.id)
  if (!made) return
  builder.apply(made.def)
  builder.select(made.id)
}
const otherPages = computed(() => def.value.pages.filter(p => p.id !== builder.pageId.value))
const menu = computed(() => [
  [
    ...(props.item.kind === 'question' ? [{ label: t('forms.screens.builder.duplicate'), icon: 'i-lucide-copy', onSelect: copy }] : []),
    ...(props.item.kind === 'row' ? [{ label: t('forms.screens.builder.unpair'), icon: 'i-lucide-rows-2', onSelect: () => builder.apply(unpair(def.value, props.item.id)) }] : []),
    { label: t('forms.screens.builder.move-up'), icon: 'i-lucide-arrow-up', disabled: props.index === 0, onSelect: () => shift(-1) },
    { label: t('forms.screens.builder.move-down'), icon: 'i-lucide-arrow-down', disabled: props.index === props.count - 1, onSelect: () => shift(1) },
    ...(otherPages.value.length
      ? [{
          label: t('forms.screens.builder.move-to-page'),
          icon: 'i-lucide-file-output',
          children: otherPages.value.map(p => ({ label: p.title.trim() || t('forms.screens.builder.page-n', { n: def.value.pages.indexOf(p) + 1 }), onSelect: () => builder.apply(moveItem(def.value, props.item.id, p.id, p.items.length)) })),
        }]
      : []),
  ],
  [{ label: t('forms.screens.builder.remove'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove() }],
])
const touch = useScreenQuery('(hover: none)')
const logic = (q: { visibleWhen?: Question['visibleWhen'] }) => q.visibleWhen ? t('forms.screens.builder.shown-when', { when: formsConditionSentence(q.visibleWhen, def.value) }) : ''
</script>

<template>
  <div
    ref="el"
    class="group/card relative"
    :class="isDragging ? 'opacity-40' : ''"
  >
    <!-- A right click on a card offers what its ellipsis does; a long press on a touch screen stays the browser's. -->
    <UContextMenu
      :modal="false"
      :items="rowMenu(menu, undefined, '')"
      :disabled="touch"
    >
      <div
        class="flex items-stretch rounded-lg border bg-default"
        :class="selected(item.id) ? 'border-primary ring-1 ring-primary' : 'border-default hover:border-accented'"
      >
        <div
          ref="handle"
          class="flex w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-l-lg text-dimmed hover:bg-elevated hover:text-default sm:w-7"
          :aria-label="t('forms.screens.builder.drag-named', { name })"
        >
          <UIcon name="i-lucide-grip-vertical" />
        </div>

        <!-- A question -->
        <button
          v-if="item.kind === 'question'"
          type="button"
          class="min-w-0 flex-1 p-3 text-left"
          :aria-pressed="selected(item.id)"
          @click="builder.select(item.id)"
        >
          <FormsQuestionCard
            :question="item"
            :logic="logic(item)"
          />
        </button>

        <!-- Two questions side by side -->
        <div
          v-else-if="item.kind === 'row'"
          class="grid min-w-0 flex-1 gap-px sm:grid-cols-2"
        >
          <button
            v-for="q in item.items"
            :key="q.id"
            type="button"
            class="min-w-0 rounded-md p-3 text-left"
            :class="selected(q.id) ? 'bg-primary/5 ring-1 ring-primary' : ''"
            :aria-pressed="selected(q.id)"
            @click="builder.select(q.id)"
          >
            <FormsQuestionCard
              :question="q"
              :logic="logic(q)"
            />
          </button>
        </div>

        <!-- A block of text -->
        <button
          v-else-if="item.kind === 'content'"
          type="button"
          class="min-w-0 flex-1 p-3 text-left"
          :aria-pressed="selected(item.id)"
          @click="builder.select(item.id)"
        >
          <p class="flex items-center gap-1.5 text-xs font-medium text-muted">
            <UIcon name="i-lucide-text" />{{ t('forms.screens.palette.content') }}
          </p>
          <p
            class="mt-1 line-clamp-3 whitespace-pre-line text-sm"
            :class="item.text.trim() ? '' : 'text-muted'"
          >
            {{ item.text.trim() || t('forms.screens.builder.empty-content') }}
          </p>
          <p
            v-if="item.visibleWhen"
            class="mt-1 text-xs text-muted"
          >
            {{ logic(item) }}
          </p>
          <FormsProblemBadge :at="item.id" />
        </button>

        <!-- A repeating group -->
        <div
          v-else
          class="min-w-0 flex-1 p-3"
        >
          <button
            type="button"
            class="block w-full text-left"
            :aria-pressed="selected(item.id)"
            @click="builder.select(item.id)"
          >
            <p class="flex items-center gap-1.5 text-xs font-medium text-muted">
              <UIcon name="i-lucide-repeat" />{{ t('forms.screens.palette.group') }}
            </p>
            <p
              class="mt-1 font-medium"
              :class="item.label.trim() ? '' : 'text-muted'"
            >
              {{ name }}
            </p>
            <p
              v-if="item.visibleWhen"
              class="mt-1 text-xs text-muted"
            >
              {{ logic(item) }}
            </p>
            <FormsProblemBadge :at="item.id" />
          </button>
          <FormsBuilderList
            class="mt-3"
            :list-key="`group:${item.id}`"
            :accept="['question']"
            :empty="t('forms.screens.builder.empty-group')"
          />
          <FormsAddMenu
            class="mt-3"
            questions-only
            :label="t('forms.screens.builder.add-to-group')"
            @add="emit('add', { kind: $event, into: item.id })"
          />
        </div>

        <div class="p-1.5">
          <RowActions
            :items="menu"
            :label="t('forms.screens.builder.actions-for', { name })"
          />
        </div>
      </div>
    </UContextMenu>
    <FormsPairZone
      v-if="pairable"
      :item-id="item.id"
    />
  </div>
</template>
