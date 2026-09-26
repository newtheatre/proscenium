<script setup lang="ts">
import { can } from '#shared/utils/abilities'
import { MY_NAV } from '#shared/utils/site-nav'

// Your own things: calm intensity and no sidebar, because a member checking a booking on a phone
// is not doing desk work (docs/design-language.md). Tonight and the bar tab are there for some.
const viewer = useViewer()
const links = computed(() => MY_NAV
  .filter(entry => can(viewer.value, entry.ability))
  .map(entry => ({ label: entry.label, icon: entry.icon, to: entry.to, exact: entry.exact })))
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <div class="dark">
      <UHeader
        title="The Nottingham New Theatre"
        :menu="{ title: 'My NNT', description: 'Your own screens on the site.' }"
        :ui="{ root: 'bg-default' }"
      >
        <template #title>
          <SiteWordmark />
        </template>
        <template #right>
          <DocsLink />
          <AuthStatus />
        </template>
        <template #body>
          <UNavigationMenu
            :items="links"
            orientation="vertical"
            aria-label="Primary"
            highlight
          />
        </template>
      </UHeader>
    </div>

    <OnShiftBar />

    <UMain class="grow">
      <!-- The strip is contained; the page is not, because every member screen already brings its
           own container. Below sm the header's menu holds the same list (0104). -->
      <UContainer class="hidden overflow-x-auto sm:block">
        <UNavigationMenu
          :items="links"
          highlight
          aria-label="My theatre"
          class="border-b border-default w-max min-w-full"
        />
      </UContainer>
      <slot />
    </UMain>

    <SiteFooter />
  </div>
</template>
