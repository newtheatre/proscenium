<!--
The "Display" menu (ADR-0012). One copy, because reading TanStack's column
model needs an `any`-typed handle and an eslint exemption.
-->
<script setup lang="ts">
const props = defineProps<{
  /**
   * The `useTemplateRef` handle on the UTable. Untyped because Nuxt UI does not
   * export the shape of `tableApi`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any
  /** Override a generated label, e.g. `{ name: 'Venue' }`. */
  labels?: Record<string, string>
}>()

const items = computed(() =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (props.table?.tableApi?.getAllColumns() ?? []).filter((column: any) => column.getCanHide()).map((column: any) => ({
    label: props.labels?.[column.id] ?? column.id.charAt(0).toUpperCase() + column.id.slice(1),
    type: 'checkbox' as const,
    checked: column.getIsVisible(),
    onUpdateChecked(checked: boolean) {
      props.table?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked)
    },
    onSelect(event?: Event) {
      // Without this the menu closes on every tick, so hiding three columns
      // means opening the menu three times.
      event?.preventDefault()
    },
  })),
)
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end' }"
  >
    <UButton
      label="Display"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-settings-2"
    />
  </UDropdownMenu>
</template>
