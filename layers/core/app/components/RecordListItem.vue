<!-- One row of a RecordList: a name with an optional icon and a line of description, then whatever
     the row ends with (a count, a badge, its actions). The `leading` slot goes before the name, such as
     a drag handle. With `to`, the whole row is a link. What a
     row needs under it (a short form, a detail) goes in the `below` slot. On a narrow screen what the
     row ends with wraps under the name rather than squeezing it. `trailing` sits beside the link.
     A right click on a row that holds a RowActions opens the same actions; on a touch screen it does not. -->
<script setup lang="ts">
import { NuxtLink } from '#components'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ to?: string, icon?: string, name?: string, description?: string, muted?: boolean, /** A fuller accessible name for the row's link than its visible words. */ label?: string, /** Where what the row ends with sits when the description runs to several lines: beside its middle, or level with the name. */ align?: 'center' | 'start' }>()
const slots = defineSlots<{ default?: () => unknown, leading?: () => unknown, name?: () => unknown, description?: () => unknown, below?: () => unknown, /** Beside the row's link and not inside it: a second link or a button on a row that is itself a link. */ trailing?: () => unknown }>()
const { t } = useT()
// What the row's own RowActions offers, said once there and read here.
const actions = shallowRef<RowMenuSource | null>(null)
provide(ROW_MENU, (source) => {
  actions.value = source
  return () => { if (actions.value === source) actions.value = null }
})
// Read again on each right click, so the handlers are the row's latest; between them only a change of words redraws.
const asked = ref(0)
const menu = computed(() => {
  void asked.value
  void actions.value?.shape()
  return rowMenu(actions.value?.items(), props.to, t('core.list.open-new-tab'))
})
// A long press on a touch screen keeps the browser's own behaviour.
const touch = useScreenQuery('(hover: none)')
</script>

<template>
  <li v-bind="$attrs">
    <UContextMenu
      :modal="false"
      :items="menu"
      :disabled="!menu.length || touch"
    >
      <div
        class="flex"
        :class="[align === 'start' ? 'items-start' : 'items-center', to && 'hover:bg-elevated/50', muted && 'text-muted']"
        @contextmenu.capture="asked++"
      >
        <component
          :is="to ? NuxtLink : 'div'"
          :to="to"
          :aria-label="to ? label : undefined"
          class="flex min-w-0 flex-1 gap-x-3 py-3 ps-4"
          :class="[align === 'start' ? 'items-start' : 'items-center', slots.trailing ? 'pe-2' : 'pe-4']"
        >
          <!-- What the row ends with wraps under the name on a narrow screen; the chevron never does. -->
          <div
            class="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-2"
            :class="align === 'start' ? 'items-start' : 'items-center'"
          >
            <slot name="leading" />
            <UUser
              :name="name"
              :description="description"
              :avatar="icon ? { icon } : undefined"
              class="min-w-0 flex-1 basis-40"
              :class="align === 'start' && 'items-start'"
            >
              <template
                v-if="slots.name"
                #name
              >
                <slot name="name" />
              </template>
              <template
                v-if="slots.description"
                #description
              >
                <slot name="description" />
              </template>
            </UUser>
            <slot />
          </div>
          <UIcon
            v-if="to && !slots.trailing"
            name="i-lucide-chevron-right"
            class="size-4 shrink-0 text-muted"
            :class="align === 'start' && 'mt-1'"
          />
        </component>
        <div
          v-if="slots.trailing"
          class="flex shrink-0 items-center gap-2 pe-4"
          :class="align === 'start' && 'pt-2'"
        >
          <slot name="trailing" />
        </div>
      </div>
    </UContextMenu>
    <div
      v-if="slots.below"
      class="px-4 pb-3"
    >
      <slot name="below" />
    </div>
  </li>
</template>
