<!-- The drawer a booking action names (core.booking-action's `drawer`), opened over the page by its
     button. Says nothing when the named component is not there, so the button's link is all there is. -->
<script setup lang="ts">
const props = defineProps<{ name: string, link: string, title: string, when: string }>()
const open = defineModel<boolean>('open', { default: false })
const found = resolveComponent(props.name)
const drawer = typeof found === 'string' ? null : found
</script>

<template>
  <component
    :is="drawer"
    v-if="drawer"
    v-model:open="open"
    :link="link"
    :title="title"
    :when="when"
  />
</template>
