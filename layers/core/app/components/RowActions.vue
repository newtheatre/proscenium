<!-- What can be done to one row, behind an ellipsis: the menu every list row and record ends with.
     `label` says whose actions they are ("Actions for Hamlet"). Nothing is drawn when there are none.
     Anything else, such as `variant="outline"`, goes to the button. Inside a RecordListItem the same
     items are the row's right-click menu. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{ items: DropdownMenuItem[] | DropdownMenuItem[][], label: string, size?: 'xs' | 'sm' | 'md' }>(), { size: 'sm' })
// The row this sits in offers the same items on a right click.
const register = inject(ROW_MENU, undefined)
// An items array written in a template is new on every render: the row tracks its shape, not the array.
const shape = computed(() => menuShape(props.items))
if (register) onScopeDispose(register({ shape: () => shape.value, items: () => toRaw(props).items }))
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
