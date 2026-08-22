<!--
Search and date-range controls for the archive tab, which is paged on the
server, so these are the only way to reach an old show (ADR-0005).
-->
<script setup lang="ts">
const search = defineModel<string>('search', { required: true })
const from = defineModel<string>('from', { required: true })
const to = defineModel<string>('to', { required: true })

const hasFilters = computed(() => Boolean(search.value || from.value || to.value))

function clear() {
  search.value = ''
  from.value = ''
  to.value = ''
}
</script>

<template>
  <AdminTableToolbar>
    <template #left>
      <UInput
        v-model="search"
        placeholder="Search by title, subtitle or venue…"
        icon="i-lucide-search"
        class="flex-1 min-w-56"
      />
    </template>
    <template #right>
      <UFormField
        label="From"
        size="xs"
      >
        <UInput
          v-model="from"
          type="date"
          aria-label="Performances from"
        />
      </UFormField>
      <UFormField
        label="To"
        size="xs"
      >
        <UInput
          v-model="to"
          type="date"
          aria-label="Performances to"
        />
      </UFormField>
      <UButton
        v-if="hasFilters"
        label="Clear"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        @click="clear"
      />
    </template>
  </AdminTableToolbar>
</template>
