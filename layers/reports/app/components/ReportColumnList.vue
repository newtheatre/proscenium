<!-- A report's columns in order, each a row that can be dragged, moved by keyboard or changed from its menu. -->
<script setup lang="ts">
defineProps<{
  names: string[]
  lines: string[]
  keys: string[]
  errors: Record<number, string>
  items: (i: number) => { label: string, icon: string, disabled?: boolean, onSelect: () => void }[]
}>()
const emit = defineEmits<{
  reorder: [move: { id: string, from: number, to: number }]
  handleKey: [event: KeyboardEvent, i: number]
}>()

const { t } = useT()
</script>

<template>
  <UFormField name="columns">
    <p
      v-if="!names.length"
      class="text-sm text-muted"
    >
      {{ t('reports.builder.no-columns') }}
    </p>
    <SortableList
      v-else
      :label="t('reports.builder.columns')"
      @reorder="emit('reorder', $event)"
    >
      <SortableRow
        v-for="(name, i) in names"
        :id="keys[i]!"
        :key="keys[i]"
        :index="i"
        :name="`C${i + 1} · ${name}`"
        :description="lines[i]"
      >
        <template #leading>
          <IconButton
            :data-drag-handle="keys[i]"
            icon="i-lucide-grip-vertical"
            size="sm"
            class="cursor-grab touch-none"
            :label="t('reports.builder.order-handle', { name })"
            aria-describedby="reports-builder-order-help"
            @keydown="emit('handleKey', $event, i)"
          />
        </template>
        <template
          v-if="errors[i]"
          #below
        >
          <p class="text-sm text-error">
            {{ errors[i] }}
          </p>
        </template>
        <RowActions
          :label="t('reports.builder.column-actions', { name })"
          :items="items(i)"
        />
      </SortableRow>
    </SortableList>
    <span
      id="reports-builder-order-help"
      class="sr-only"
    >{{ t('reports.builder.order-keys') }}</span>
  </UFormField>
</template>
