<!-- The canvas: the open page's questions, as cards that are dragged by their grip to reorder them,
     onto the edge of another question to sit beside it, into a repeating group, or onto another
     page in the outline. The same moves are in each card's menu for the keyboard (FB-201). -->
<script setup lang="ts">
import { DragDropProvider } from '@dnd-kit/vue'
import { move } from '@dnd-kit/helpers'
import { addCalculation, addItem, addPage, blankContent, blankGroup, blankQuestion, calculationsOn, change, dependents, freshId, moveCalculation, moveItem, movePage, pair, removeCalculation, removePage } from '../../shared/builder/edit'
import { formulaOf } from '../../shared/builder/formula'
import type { Definition, Item, Page, Question, QuestionType } from '../../shared/engine'

const { t } = useT()
const builder = useBuilder()
const def = computed(() => builder.definition.value)
const page = computed(() => def.value.pages.find(p => p.id === builder.pageId.value) ?? def.value.pages[0]!)
const pageIndex = computed(() => def.value.pages.indexOf(page.value))
const pageKey = computed(() => `page:${page.value.id}`)

// While a drag is under way the lists are drawn from this board, which the drag reorders; the
// definition changes once, when the drag ends.
const board = ref<Record<string, Item[]>>({})
function rebuild() {
  const next: Record<string, Item[]> = { [pageKey.value]: [...page.value.items] }
  for (const item of page.value.items) if (item.kind === 'group') next[`group:${item.id}`] = [...item.items]
  board.value = next
}
watch([page, pageKey], rebuild, { immediate: true })

const dragging = ref<{ id: string, type: string } | null>(null)
provide(FORMS_CANVAS, { board, dragging })

function onStart(event: any) {
  const source = event.operation.source
  dragging.value = source ? { id: String(source.id), type: String(source.type) } : null
}
const special = (id: unknown) => typeof id === 'string' && (id.startsWith('pair:') || id.startsWith('outline:'))
// The right-hand half of a question is where another is dropped to sit beside it. While a question
// is dragged through that half nothing reorders, so the question being aimed at stays where it is.
const list = useTemplateRef<HTMLElement>('list')
function pairing(event: any): boolean {
  const x = event.operation.position?.current?.x
  const box = list.value?.getBoundingClientRect()
  return dragging.value?.type === 'question' && typeof x === 'number' && !!box && x > box.left + box.width / 2
}
function onOver(event: any) {
  if (special(event.operation.target?.id) || pairing(event)) return event.preventDefault()
  board.value = move(board.value, event)
}
function onEnd(event: any) {
  const source = dragging.value
  dragging.value = null
  const target = event.operation.target?.id
  if (!source || event.canceled) return rebuild()
  if (typeof target === 'string' && target.startsWith('pair:')) {
    rebuild()
    return builder.apply(pair(def.value, source.id, target.slice(5))) // not-policy: the length of "pair:"
  }
  if (typeof target === 'string' && target.startsWith('outline:')) {
    const to = def.value.pages.find(p => p.id === target.slice(8)) // not-policy: the length of "outline:"
    rebuild()
    if (to && to.id !== page.value.id) builder.apply(moveItem(def.value, source.id, to.id, to.items.length))
    return
  }
  board.value = move(board.value, event)
  const next = JSON.parse(JSON.stringify(def.value)) as Definition
  const open = next.pages[pageIndex.value]!
  open.items = (board.value[pageKey.value] ?? []).map((item) => {
    if (item.kind !== 'group') return item
    return { ...item, items: (board.value[`group:${item.id}`] ?? item.items) as Question[] }
  })
  if (JSON.stringify(open.items) === JSON.stringify(page.value.items)) return rebuild()
  builder.apply(next)
}

function add(kind: QuestionType | 'content' | 'group', into = page.value.id) {
  const item = kind === 'content' ? blankContent(def.value) : kind === 'group' ? blankGroup(def.value) : blankQuestion(def.value, kind)
  builder.apply(addItem(def.value, into, item))
  builder.select(item.id)
}
defineExpose({ add })

// ---- the outline: pages and endings ----
const { confirm } = useConfirm()
const { polite } = useAnnouncer()
const pageName = (p: Page, i: number) => p.title.trim() || t('forms.screens.builder.page-n', { n: i + 1 })
function open(id: string) {
  builder.pageId.value = id
  builder.select(id)
}
function newPage() {
  const made = addPage(def.value, page.value.id)
  builder.apply(made.def)
  open(made.id)
}
function shiftPage(p: Page, i: number, by: number) {
  builder.apply(movePage(def.value, p.id, i + by))
  polite(t('forms.screens.builder.moved', { name: pageName(p, i), position: i + by + 1, count: def.value.pages.length }))
}
async function dropPage(p: Page, i: number) {
  if (p.items.length && !(await confirm({ verb: t('forms.screens.builder.remove'), thing: `"${pageName(p, i)}"`, consequence: t('forms.screens.builder.remove-page', { count: p.items.length }) }))) return
  builder.apply(removePage(def.value, p.id))
}
const pageMenu = (p: Page, i: number) => [
  [
    { label: t('forms.screens.builder.move-up'), icon: 'i-lucide-arrow-up', disabled: i === 0, onSelect: () => shiftPage(p, i, -1) },
    { label: t('forms.screens.builder.move-down'), icon: 'i-lucide-arrow-down', disabled: i === def.value.pages.length - 1, onSelect: () => shiftPage(p, i, 1) },
  ],
  [{ label: t('forms.screens.builder.remove'), icon: 'i-lucide-trash-2', color: 'error' as const, disabled: def.value.pages.length < 2, onSelect: () => dropPage(p, i) }],
]
function newEnding() {
  const next = JSON.parse(JSON.stringify(def.value)) as Definition
  const id = freshId(next, 'end')
  next.endings = [...(next.endings ?? []), { id, title: '', submits: false }]
  builder.apply(next)
  builder.selected.value = id
}
function dropEnding(id: string) {
  const next = JSON.parse(JSON.stringify(def.value)) as Definition
  next.endings = next.endings?.filter(e => e.id !== id)
  if (!next.endings?.length) Reflect.deleteProperty(next, 'endings')
  for (const p of next.pages) {
    p.routes = p.routes?.filter(r => !('ending' in r.to && r.to.ending === id))
    if (!p.routes?.length) Reflect.deleteProperty(p, 'routes')
  }
  builder.apply(next)
}
// ---- calculations: listed in the outline, and each shown on its page as the line people will see ----
const { figure, figureName } = useFormsFigures()
const calculations = computed(() => def.value.calculations ?? [])
const shownHere = computed(() => calculationsOn(def.value, page.value.id).map((c) => {
  const formula = formulaOf(c.expression)
  return { calculation: c, name: c.label?.trim() || t('forms.screens.calculations.untitled'), sentence: formula ? formsFormulaSentence(formula, def.value, (v, i) => c.type === 'money' && (i === 0 || ['add', 'subtract'].includes(formula.rows[i]!.op ?? '')) ? figure({ type: 'money' }, v) : String(v)) : t('forms.screens.calculations.written') }
}))
function newCalculation() {
  const made = addCalculation(def.value, page.value.id)
  builder.apply(made.def)
  builder.select(made.id)
}
async function dropCalculation(id: string, name: string) {
  const readers = dependents(def.value, id).length
  if (readers && !(await confirm({ verb: t('forms.screens.builder.remove'), thing: `"${name}"`, consequence: t('forms.screens.calculations.remove-read', { count: readers }) }))) return
  builder.apply(removeCalculation(def.value, id))
}
const calculationMenu = (id: string, i: number, name: string) => [
  [
    { label: t('forms.screens.builder.move-up'), icon: 'i-lucide-arrow-up', disabled: i === 0, onSelect: () => builder.apply(moveCalculation(def.value, id, -1)) },
    { label: t('forms.screens.builder.move-down'), icon: 'i-lucide-arrow-down', disabled: i === calculations.value.length - 1, onSelect: () => builder.apply(moveCalculation(def.value, id, 1)) },
  ],
  [{ label: t('forms.screens.builder.remove'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => dropCalculation(id, name) }],
]
const calculationWrong = (id: string) => builder.problemsAt.value.get(id)?.some(p => p.level === 'error')
const setPage = (fn: (p: Page) => void, field: string) => builder.apply(change(def.value, page.value.id, fn), `${page.value.id}:${field}`)
</script>

<template>
  <DragDropProvider
    @drag-start="onStart"
    @drag-over="onOver"
    @drag-end="onEnd"
  >
    <div class="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav
        class="space-y-4 lg:sticky lg:top-4 lg:self-start"
        :aria-label="t('forms.screens.builder.outline')"
      >
        <div>
          <p class="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
            {{ t('forms.screens.builder.pages') }}
          </p>
          <ol class="space-y-1">
            <FormsOutlinePage
              v-for="(p, i) in def.pages"
              :key="p.id"
              :page="p"
              :name="pageName(p, i)"
              :number="i + 1"
              :open="p.id === page.id"
              :menu="pageMenu(p, i)"
              @open="open(p.id)"
            />
          </ol>
          <UButton
            class="mt-2"
            :label="t('forms.screens.builder.add-page')"
            icon="i-lucide-plus"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="newPage"
          />
        </div>
        <div>
          <p class="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
            {{ t('forms.screens.endings.title') }}
          </p>
          <ul class="space-y-1">
            <li
              v-for="e in def.endings ?? []"
              :key="e.id"
              class="flex items-center gap-1"
            >
              <UButton
                class="min-w-0 flex-1 justify-start"
                :label="e.title.trim() || t('forms.screens.builder.untitled-ending')"
                :icon="e.submits ? 'i-lucide-circle-check' : 'i-lucide-circle-slash'"
                size="sm"
                color="neutral"
                :variant="builder.selected.value === e.id ? 'soft' : 'ghost'"
                @click="builder.selected.value = e.id"
              />
              <IconButton
                icon="i-lucide-x"
                size="sm"
                :label="t('forms.screens.endings.remove')"
                @click="dropEnding(e.id)"
              />
            </li>
          </ul>
          <UButton
            class="mt-2"
            :label="t('forms.screens.endings.add')"
            icon="i-lucide-plus"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="newEnding"
          />
        </div>
        <div>
          <p class="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
            {{ t('forms.screens.calculations.title') }}
          </p>
          <ul class="space-y-1">
            <li
              v-for="(c, i) in calculations"
              :key="c.id"
              class="flex items-center gap-1"
            >
              <UButton
                class="min-w-0 flex-1 justify-start"
                icon="i-lucide-calculator"
                size="sm"
                color="neutral"
                :variant="builder.selected.value === c.id ? 'soft' : 'ghost'"
                @click="builder.select(c.id)"
              >
                <span
                  class="truncate"
                  :class="c.label?.trim() ? '' : 'text-muted'"
                >{{ c.label?.trim() || c.key }}</span>
                <UIcon
                  v-if="calculationWrong(c.id)"
                  name="i-lucide-circle-alert"
                  class="ms-auto shrink-0 text-error"
                  :aria-label="t('forms.screens.problems.has')"
                />
              </UButton>
              <UDropdownMenu :items="calculationMenu(c.id, i, figureName(c))">
                <IconButton
                  icon="i-lucide-ellipsis-vertical"
                  size="sm"
                  :label="t('forms.screens.builder.actions-for', { name: figureName(c) })"
                />
              </UDropdownMenu>
            </li>
          </ul>
          <UButton
            class="mt-2"
            :label="t('forms.screens.calculations.add')"
            icon="i-lucide-plus"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="newCalculation"
          />
        </div>
      </nav>
      <div
        ref="list"
        class="mx-auto w-full max-w-3xl space-y-4"
      >
        <div
          class="rounded-lg border bg-default p-4"
          :class="builder.selected.value === page.id ? 'border-primary ring-1 ring-primary' : 'border-default'"
          @click="builder.select(page.id)"
        >
          <p class="text-xs font-medium uppercase tracking-wide text-muted">
            {{ t('forms.screens.builder.page-of', { n: pageIndex + 1, count: def.pages.length }) }}
          </p>
          <UInput
            :model-value="page.title"
            variant="none"
            size="xl"
            :placeholder="t('forms.screens.builder.page-title')"
            :aria-label="t('forms.screens.details.page-title')"
            :ui="{ base: 'px-0 text-xl font-semibold' }"
            @update:model-value="setPage((p) => { p.title = String($event) }, 'title')"
          />
          <p
            v-if="page.help"
            class="text-sm text-muted"
          >
            {{ page.help }}
          </p>
          <FormsProblemBadge :at="page.id" />
        </div>

        <FormsBuilderList
          :list-key="pageKey"
          :accept="['question', 'block']"
          :empty="t('forms.screens.builder.empty-page')"
          @add="add($event.kind, $event.into)"
        />

        <button
          v-for="c in shownHere"
          :key="c.calculation.id"
          type="button"
          class="block w-full rounded-lg border border-dashed bg-elevated/40 p-3 text-left text-sm"
          :class="builder.selected.value === c.calculation.id ? 'border-primary ring-1 ring-primary' : 'border-default'"
          :data-calculation="c.calculation.id"
          @click="builder.select(c.calculation.id)"
        >
          <span class="flex items-center justify-between gap-4">
            <span class="flex items-center gap-2 font-medium">
              <UIcon
                name="i-lucide-calculator"
                class="shrink-0 text-muted"
              />
              {{ c.name }}
            </span>
            <span class="text-xs text-muted">{{ t(`forms.screens.calculations.format-${c.calculation.type}`) }}</span>
          </span>
          <span class="mt-1 block text-muted">= {{ c.sentence }}</span>
          <FormsProblemBadge :at="c.calculation.id" />
        </button>

        <div class="flex flex-wrap items-center gap-2">
          <FormsAddMenu @add="add($event)" />
        </div>
      </div>
    </div>
  </DragDropProvider>
</template>
