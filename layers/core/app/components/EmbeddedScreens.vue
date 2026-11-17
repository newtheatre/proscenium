<!-- Draws its slot as screens inside another frame (EMBEDDED_FRAME): a module's tab in Admin, or the
     console's settings window when `window` is set. -->
<script setup lang="ts">
const props = defineProps<{ window?: boolean }>()
provide(EMBEDDED_FRAME, true)
provide(CONSOLE_WINDOW, props.window === true)
</script>

<template>
  <slot />
</template>
