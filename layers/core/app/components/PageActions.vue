<!-- A page's actions for its `primary` slot when there are more than one: every action is a worded
     button from 640 pixels, and on a phone the first stays a button while the rest fold into one
     "More" menu, so the bar never overflows. The first action is the page's primary one. -->
<script setup lang="ts">
export interface PageAction {
  label: string
  icon?: string
  to?: string
  onSelect?: () => void
  loading?: boolean
  disabled?: boolean
  /** Never the page's primary action, even when it is the only one left to show. */
  lesser?: boolean
}

const props = defineProps<{
  actions: PageAction[]
  /** The menu's name on a phone, when "More" alone would not say enough. */
  moreLabel?: string
}>()
const { t } = useT()
const rest = computed(() => props.actions.slice(1))
const menu = computed(() => [rest.value.map(a => ({ label: a.label, icon: a.icon, to: a.to, disabled: a.disabled || a.loading, onSelect: a.onSelect }))])
</script>

<template>
  <UButton
    v-for="(action, i) in actions"
    :key="action.label"
    :label="action.label"
    :icon="action.icon"
    :to="action.to"
    :loading="action.loading"
    :disabled="action.disabled"
    :color="i || action.lesser ? 'neutral' : 'primary'"
    :variant="i || action.lesser ? 'outline' : 'solid'"
    :class="i ? 'max-sm:hidden' : undefined"
    @click="action.onSelect?.()"
  />
  <RowActions
    v-if="rest.length"
    class="sm:hidden"
    size="md"
    variant="outline"
    :items="menu"
    :label="moreLabel ?? t('core.page-actions.more')"
  />
</template>
