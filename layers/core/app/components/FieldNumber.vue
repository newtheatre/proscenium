<!-- A whole number or a count: Nuxt UI's number box at a width that suits a few digits, where the
     theme's default fills the row. `class="w-24"` or `class="w-full"` gives another width; every
     other prop, the model and the events go to UInputNumber. -->
<script setup lang="ts">
defineOptions({ inheritAttrs: false })
</script>

<template>
  <UInputNumber
    v-bind="$attrs"
    :ui="{ root: 'w-32' }"
  />
</template>
