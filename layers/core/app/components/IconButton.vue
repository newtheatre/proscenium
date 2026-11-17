<!-- A button that is only an icon. One `label` names it twice: for a screen reader, and in a tooltip
     for someone with a pointer, who otherwise has to guess what an arrow or a bin does. Everything
     else is UButton's, and it is neutral and ghost unless told otherwise. -->
<script setup lang="ts">
defineOptions({ inheritAttrs: false })
defineProps<{ label: string, icon: string }>()
</script>

<template>
  <UTooltip :text="label">
    <UButton
      :icon="icon"
      :aria-label="label"
      color="neutral"
      variant="ghost"
      v-bind="$attrs"
    />
  </UTooltip>
</template>
