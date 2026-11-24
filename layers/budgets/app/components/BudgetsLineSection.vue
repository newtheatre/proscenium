<!-- One kind of a budget's lines, spending or income: dragged into order while the budget can be
     edited, otherwise listed. Spending lines show a bar of how much is committed and spent. -->
<script setup lang="ts" generic="L extends SectionLine">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { SectionLine } from '../composables/useBudgetText'

const props = defineProps<{
  lines: L[]
  title: string
  description?: string
  empty: string
  addLabel: string
  editable: boolean
  /** Shows how much of each line is used. */
  bars?: boolean
  describe: (line: L) => string
  share: (line: L) => number
  actions: (line: L) => DropdownMenuItem[]
}>()
const emit = defineEmits<{ add: [], reorder: [move: { id: string, from: number, to: number }], move: [line: L, by: -1 | 1] }>()
const { t } = useT()

async function onHandleKey(event: KeyboardEvent, line: L) {
  const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!by) return
  event.preventDefault()
  emit('move', line, by)
  await nextTick()
  document.querySelector<HTMLElement>(`[data-drag-handle="${line.id}"]`)?.focus()
}
const barOf = (l: L) => ({ modelValue: props.share(l), color: l.figures.over ? 'warning' as const : 'primary' as const, ariaLabel: props.describe(l) })
</script>

<template>
  <PageSection
    :title="title"
    :description="description"
  >
    <template
      v-if="editable"
      #actions
    >
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-plus"
        :label="addLabel"
        @click="emit('add')"
      />
    </template>
    <p
      v-if="!lines.length"
      class="text-muted"
    >
      {{ empty }}
    </p>
    <SortableList
      v-else-if="editable"
      :label="title"
      @reorder="emit('reorder', $event)"
    >
      <SortableRow
        v-for="(l, position) in lines"
        :id="l.id"
        :key="l.id"
        :index="position"
        :name="l.name"
        :description="describe(l)"
      >
        <template #leading>
          <IconButton
            :data-drag-handle="l.id"
            icon="i-lucide-grip-vertical"
            size="sm"
            class="cursor-grab touch-none"
            :label="t('budgets.screens.line.handle', { name: l.name })"
            @keydown="onHandleKey($event, l)"
          />
        </template>
        <template
          v-if="bars"
          #below
        >
          <UProgress
            v-bind="barOf(l)"
            size="xs"
            class="mt-2 max-w-64"
          />
        </template>
        <RowActions
          :items="actions(l)"
          :label="t('budgets.screens.line.actions', { name: l.name })"
        />
      </SortableRow>
    </SortableList>
    <RecordList
      v-else
      :label="title"
    >
      <RecordListItem
        v-for="l in lines"
        :key="l.id"
        :name="l.name"
        :description="describe(l)"
      >
        <template
          v-if="bars"
          #below
        >
          <UProgress
            v-bind="barOf(l)"
            size="xs"
            class="mt-2 max-w-64"
          />
        </template>
      </RecordListItem>
    </RecordList>
  </PageSection>
</template>
