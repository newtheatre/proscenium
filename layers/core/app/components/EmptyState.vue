<!-- Empty says what belongs here, why it might be empty, and offers the action that fills it. -->
<script setup lang="ts">
import { Comment, Fragment, Text, type VNode } from 'vue'

const props = defineProps<{
  title: string
  description?: string
  icon?: string
  /** The screen's documentation page. */
  help?: string
}>()
const { t } = useT()
const slots = defineSlots<{ actions?: () => VNode[] }>()
// An actions slot that renders nothing (a button behind a v-if) leaves no empty band under the words.
function filled(nodes: VNode[]): boolean {
  return nodes.some(n => n.type === Comment
    ? false
    : n.type === Fragment
      ? Array.isArray(n.children) && filled(n.children as VNode[])
      : n.type !== Text || !!String(n.children).trim())
}
const hasActions = () => !!props.help || (!!slots.actions && filled(slots.actions()))
</script>

<template>
  <UEmpty
    :title="title"
    :description="description"
    :icon="icon ?? 'i-lucide-inbox'"
  >
    <template
      v-if="hasActions()"
      #actions
    >
      <slot name="actions" />
      <UButton
        v-if="help"
        :to="help"
        color="neutral"
        variant="link"
        :label="t('core.empty.help')"
      />
    </template>
  </UEmpty>
</template>
