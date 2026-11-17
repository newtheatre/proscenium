<!-- What can be done to one row, behind an ellipsis: the menu every list row and record ends with.
     `label` says whose actions they are ("Actions for Hamlet"). Nothing is drawn when there are none.
     Anything else, such as `variant="outline"`, goes to the button. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ items: DropdownMenuItem[] | DropdownMenuItem[][], label: string, size?: 'xs' | 'sm' | 'md' }>(), { size: 'sm' })
</script>

<template>
  <UDropdownMenu
    v-if="items.length"
    :items="items"
  >
    <IconButton
      icon="i-lucide-ellipsis"
      :label="label"
      :size="size"
      v-bind="$attrs"
    />
  </UDropdownMenu>
</template>
