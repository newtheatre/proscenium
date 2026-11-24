<!-- A collection's chip (C-60): its name on its own colour, with text in white or near-black,
     whichever reads better. A link when `to` is given. -->
<script setup lang="ts">
import { textOn } from '../../shared/colour'

const props = defineProps<{ name: string, colour: string, to?: string }>()
const style = computed(() => ({ backgroundColor: props.colour, color: textOn(props.colour) }))
</script>

<template>
  <ULink
    v-if="to"
    :to="to"
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium underline-offset-2 hover:underline"
    :style="style"
  >
    {{ name }}
  </ULink>
  <span
    v-else
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium"
    :style="style"
  >{{ name }}</span>
</template>
