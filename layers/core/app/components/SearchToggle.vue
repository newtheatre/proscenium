<!-- A search icon that opens into a box where it stands, for a short list that needs a search now
     and then: beside a page's main action, it takes no room until it is wanted. Escape, or leaving
     it empty, closes it again. -->
<script setup lang="ts">
const props = defineProps<{ label: string }>()
const query = defineModel<string>({ default: '' })
const open = defineModel<boolean>('open', { default: false })
if (query.value) open.value = true
const input = useTemplateRef<{ inputRef?: HTMLInputElement }>('input')
async function show() {
  open.value = true
  await nextTick()
  input.value?.inputRef?.focus()
}
function close() {
  query.value = ''
  open.value = false
}
const blur = () => { if (!query.value.trim()) open.value = false }
</script>

<template>
  <UInput
    v-if="open"
    ref="input"
    v-model="query"
    type="search"
    icon="i-lucide-search"
    :placeholder="props.label"
    :aria-label="props.label"
    class="w-40 sm:w-64"
    @blur="blur"
    @keydown.escape="close"
  />
  <IconButton
    v-else
    icon="i-lucide-search"
    :label="props.label"
    @click="show"
  />
</template>
