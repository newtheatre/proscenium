<!-- The Filters button and its panel, for a screen whose filters are its own (a PageList draws its
     declared filters in one already): a popover on a laptop, a drawer from the bottom on a phone,
     ending with "Clear all" and "Done". The fields go in the default slot; `count` is how many are on. -->
<script setup lang="ts">
import { UDrawer, UPopover } from '#components'

defineProps<{ count: number }>()
const emit = defineEmits<{ clear: [] }>()
const open = defineModel<boolean>('open', { default: false })
defineSlots<{ default?: () => unknown }>()

const { t } = useT()
// The drawer only once hydrated: the server draws the popover, and the first render must match it.
const phone = useScreenQuery('(max-width: 639px)')
</script>

<template>
  <component
    :is="phone ? UDrawer : UPopover"
    v-model:open="open"
    v-bind="phone ? { direction: 'bottom', title: t('core.list.filters'), description: t('core.list.filters-description') } : { content: { align: 'start' } }"
  >
    <UButton
      color="neutral"
      variant="outline"
      icon="i-lucide-sliders-horizontal"
      :label="count ? t('core.list.filters-on', { count }) : t('core.list.filters')"
      aria-haspopup="dialog"
    />
    <template #content>
      <div
        class="w-full space-y-4 p-4 sm:w-96"
        role="group"
        :aria-label="t('core.list.filters')"
      >
        <slot />
        <div class="flex items-center justify-between gap-2 border-t border-default pt-3">
          <UButton
            color="neutral"
            variant="link"
            :label="t('core.list.clear-all')"
            :disabled="!count"
            @click="emit('clear')"
          />
          <UButton
            :label="t('core.list.done')"
            @click="open = false"
          />
        </div>
      </div>
    </template>
  </component>
</template>
