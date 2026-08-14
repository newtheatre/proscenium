<!--
The footer under an admin table: what you are looking at on the left, the
pager on the right.

Props are plain numbers rather than a handle on the table: reading
`table?.tableApi?.getFilteredRowModel()` in a template re-walks the whole
row model on every render (ADR-0012). Callers already own their `pagination`
and `rowSelection` refs, so they can pass counts they know.
-->
<script setup lang="ts">
const props = defineProps<{
  /** Row count across all pages — the server's `total` where paging is server-side. */
  total: number
  limit: number
  /** Selected-row count. Omit on tables without selection. */
  selected?: number
  /** Singular noun for the count, e.g. `'venue'`. Pluralised with a trailing s. */
  label?: string
  /** Plural form, where a trailing s will not do — `'passes'`, not `'passs'`. */
  labelPlural?: string
  /** Appended to the count when a filter is narrowing the set, e.g. `'matching'`. */
  suffix?: string
}>()

const page = defineModel<number>('page', { required: true })

/**
 * The count always reads the same way — "12 venues" — with selection folded in
 * only when something is actually selected. Pages used to disagree here: two
 * showed "0 of 12 row(s) selected." permanently, on tables that have no bulk
 * action to perform on a selection, while a third showed the plain count.
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
