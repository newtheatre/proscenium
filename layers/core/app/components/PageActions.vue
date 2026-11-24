<!-- A page's actions for its `primary` slot: worded buttons from 640 pixels, and on a phone the first
     stays a button while the rest fold into one "More" menu, with `menu`'s lesser items, which sit behind
     an ellipsis at every width. The first action is the page's primary one. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

export interface PageAction {
  label: string
  icon?: string
  to?: string
  /** A promise keeps the button spinning until it settles. */
  onSelect?: () => unknown
  loading?: boolean
  disabled?: boolean
  /** Never the page's primary action, even when it is the only one left to show. */
  lesser?: boolean
}

const props = defineProps<{
  actions: PageAction[]
  /** The menu's name on a phone, when "More" alone would not say enough. */
  moreLabel?: string
  /** Lesser things done to the page, always in its ellipsis menu. */
  menu?: DropdownMenuItem[] | DropdownMenuItem[][]
}>()
const { t } = useT()
const rest = computed(() => props.actions.slice(1))
const extra = computed(() => {
  const items = props.menu ?? []
  return (Array.isArray(items[0]) ? items as DropdownMenuItem[][] : [items as DropdownMenuItem[]]).filter(group => group.length)
})
const folded = computed(() => rest.value.map(a => ({ label: a.label, icon: a.icon, to: a.to, disabled: a.disabled || a.loading, onSelect: () => { void a.onSelect?.() } })))
const phoneMenu = computed(() => [folded.value, ...extra.value].filter(group => group.length))
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
    loading-auto
    @click="action.onSelect?.()"
  />
  <RowActions
    v-if="extra.length"
    class="max-sm:hidden"
    size="md"
    variant="outline"
    :items="extra"
    :label="moreLabel ?? t('core.page-actions.more')"
  />
  <RowActions
    v-if="phoneMenu.length"
    class="sm:hidden"
    size="md"
    variant="outline"
    :items="phoneMenu"
    :label="moreLabel ?? t('core.page-actions.more')"
  />
</template>
