<!-- The members' area on a phone (UI-03): a bar along the bottom with the first four sections and
     More for the rest. Nuxt UI has no bottom tab bar, so the shape is set here once: each tab is a
     button with its icon above its label, 48 pixels tall, and a count sits on the icon. With one
     section there is nothing to switch between, so no bar: the header's bell and the home lead there. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const SHOWN = 4 // not-policy: the specification's four sections plus More

const props = defineProps<{
  sections: { id: string, to: string, icon: string, label: string, count?: number, active: boolean }[]
  /** The landmark's name: the members' area's own name. */
  label: string
}>()
const { t } = useT()

const shown = computed(() => props.sections.slice(0, SHOWN))
const more = computed<DropdownMenuItem[]>(() => props.sections.slice(SHOWN).map(i => ({ label: t(i.label), icon: i.icon, to: i.to })))
const tab = { base: 'min-h-(--proscenium-target-live) flex-1 flex-col justify-center gap-0.5 rounded-none text-xs', leadingIcon: 'size-5' }
</script>

<template>
  <nav
    v-if="sections.length > 1"
    :aria-label="label"
    class="fixed inset-x-0 bottom-0 z-40 flex border-t border-default bg-default sm:hidden"
  >
    <UButton
      v-for="s in shown"
      :key="s.id"
      :to="s.to"
      :label="t(s.label)"
      :color="s.active ? 'primary' : 'neutral'"
      variant="ghost"
      :active="s.active"
      :aria-current="s.active ? 'page' : undefined"
      :ui="tab"
    >
      <template #leading>
        <UChip
          :show="!!s.count"
          :text="s.count"
          size="xl"
        >
          <UIcon
            :name="s.icon"
            class="size-5"
          />
        </UChip>
      </template>
    </UButton>
    <UDropdownMenu
      v-if="more.length"
      :items="more"
      :content="{ side: 'top', align: 'end' }"
    >
      <UButton
        :label="t('core.members.more')"
        icon="i-lucide-ellipsis"
        color="neutral"
        variant="ghost"
        :ui="tab"
      />
    </UDropdownMenu>
  </nav>
</template>
