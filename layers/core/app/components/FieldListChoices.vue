<!-- Several values picked from a list the server gives (a setting's `choices` route). A value
     already chosen that the list no longer holds stays shown by itself, so it can be removed. -->
<script setup lang="ts">
interface Item { value: string, label: string }
const props = defineProps<{ /** A GET route answering `{ items: Item[] }`. */ route: string, disabled?: boolean }>()
const model = defineModel<string[]>({ default: () => [] })

const { t } = useT()
const { data } = useAPI<{ items: Item[] }>(() => props.route, { key: `choices:${props.route}`, lazy: true, default: () => ({ items: [] }) })

const items = computed(() => {
  const known = data.value?.items ?? []
  const gone = model.value.filter(v => !known.some(i => i.value === v)).map(v => ({ value: v, label: v }))
  return [...known, ...gone]
})
</script>

<template>
  <UInputMenu
    v-model="model"
    :items="items"
    value-key="value"
    multiple
    open-on-click
    :placeholder="t('core.settings-page.choose')"
    :disabled="disabled"
    class="w-full"
  />
</template>
