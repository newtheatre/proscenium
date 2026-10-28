<script setup lang="ts">
import { quickFinds, quickJumpScreens } from '#shared/utils/quick-jump'
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'

// Ctrl+K (Cmd+K on a Mac) from any console screen: a screen by name, or a name or title sent to
// the list that searches it (0256). Only what the viewer's sidebar would already offer.
const viewer = useViewer()
const term = ref('')

const groups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => [
  // Built from the typed words, so the palette's own filter would only hide them again.
  { id: 'finds', label: 'Search a list', items: quickFinds(viewer.value, term.value), ignoreFilter: true },
  ...quickJumpScreens(viewer.value),
])
</script>

<template>
  <UDashboardSearch
    v-model:search-term="term"
    shortcut="meta_k"
    :color-mode="false"
    preserve-group-order
    title="Go to"
    description="Open a screen by its name, or search a list for a name or a title."
    placeholder="Go to a screen, or search for a name or a title"
    :groups="groups"
    data-test="quick-jump"
  >
    <!-- Nuxt UI's English strings name no title or description for this dialogue, so ours are given. -->
    <template #empty>
      <p class="py-6 text-center text-sm text-muted">
        No screen you can open is called that. Type two letters or more to search a list.
      </p>
    </template>
  </UDashboardSearch>
</template>
