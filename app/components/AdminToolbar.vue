<script setup lang="ts">
// One shape for every admin list: a search of fixed width, the filters behind one button so the row
// cannot resize, and what is filtered shown as chips (0032).

export interface ActiveFilter {
  key: string
  label: string
  icon?: string
  clear: () => void
}

const search = defineModel<string>('search', { default: '' })

withDefaults(defineProps<{
  placeholder?: string
  active?: ActiveFilter[]
  loading?: boolean
  // A page with nothing behind the button says so rather than offering an empty panel.
  filterable?: boolean
}>(), {
  placeholder: 'Search',
  active: () => [],
  loading: false,
  filterable: true,
})

const emit = defineEmits<{ clear: [] }>()
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        :placeholder="placeholder"
        :loading="loading"
        class="w-full sm:w-80"
        data-test="toolbar-search"
      />

      <UPopover v-if="filterable">
        <UButton
          icon="i-lucide-sliders-horizontal"
          color="neutral"
          variant="outline"
          data-test="toolbar-filters"
          :label="active.length ? `Filters (${active.length})` : 'Filters'"
        />

        <template #content>
          <div class="w-80 max-h-[calc(100vh-8rem)] space-y-4 overflow-y-auto p-4">
            <slot name="filters" />
          </div>
        </template>
      </UPopover>

      <div class="ms-auto flex flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </div>

    <div
      v-if="active.length"
      class="flex flex-wrap items-center gap-2"
      data-test="toolbar-active"
    >
      <UBadge
        v-for="filter in active"
        :key="filter.key"
        :icon="filter.icon"
        color="neutral"
        variant="subtle"
      >
        {{ filter.label }}
        <UButton
          icon="i-lucide-x"
          size="xs"
          variant="ghost"
          color="neutral"
          :aria-label="`Clear ${filter.label}`"
          @click="filter.clear()"
        />
      </UBadge>

      <UButton
        label="Clear all"
        size="xs"
        color="neutral"
        variant="ghost"
        data-test="toolbar-clear"
        @click="emit('clear')"
      />
    </div>
  </div>
</template>
