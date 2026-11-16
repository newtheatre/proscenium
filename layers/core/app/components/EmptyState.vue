<!-- Empty says what belongs here, why it might be empty, and offers the action that fills it. -->
<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  icon?: string
  /** The screen's documentation page. */
  help?: string
}>()
const { t } = useT()
</script>

<template>
  <UEmpty
    :title="title"
    :description="description"
    :icon="icon ?? 'i-lucide-inbox'"
    class="py-12"
  >
    <template #actions>
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
