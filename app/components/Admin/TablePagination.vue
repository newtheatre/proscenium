<!--
The footer under an admin table. Props are plain numbers, not a table handle,
so nothing re-walks the row model to report a count (ADR-0012).
-->
<script setup lang="ts">
const props = defineProps<{
  /** Row count across all pages: the server's `total` where paging is server-side. */
  total: number
  limit: number
  /** Selected-row count. Omit on tables without selection. */
  selected?: number
  /** Singular noun for the count, e.g. `'venue'`. Pluralised with a trailing s. */
  label?: string
  /** Plural form, where a trailing s will not do: `'passes'`, not `'passs'`. */
  labelPlural?: string
  /** Appended to the count when a filter is narrowing the set, e.g. `'matching'`. */
  suffix?: string
}>()

const page = defineModel<number>('page', { required: true })

/**
 * The count always reads the same way ("12 venues") with selection folded in
 * only when something is selected.
 */
const summary = computed(() => {
  const singular = props.label ?? 'row'
  const noun = props.total === 1 ? singular : (props.labelPlural ?? `${singular}s`)
  const base = `${formatCount(props.total)} ${noun}${props.suffix ? ` ${props.suffix}` : ''}`
  return props.selected ? `${formatCount(props.selected)} selected · ${base}` : base
})
</script>

<template>
  <div class="flex items-center justify-between gap-3 border-t border-default pt-4 mt-auto">
    <p class="text-sm text-muted">
      {{ summary }}
    </p>

    <UPagination
      v-model:page="page"
      :items-per-page="limit"
      :total="total"
    />
  </div>
</template>
