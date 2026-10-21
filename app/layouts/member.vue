<script setup lang="ts">
import { can } from '#shared/utils/abilities'
import { MY_NAV, memberNavActive } from '#shared/utils/site-nav'

// Your own things: calm intensity and no sidebar, because a member checking a booking on a phone
// is not doing desk work (docs/design-language.md). Tonight and the bar tab are there for some.
const viewer = useViewer()
const route = useRoute()
const links = computed(() => MY_NAV
  .filter(entry => can(viewer.value, entry.ability))
  .map(entry => ({ label: entry.label, icon: entry.icon, to: entry.to, active: memberNavActive(entry, route.path) })))
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
        <!-- The public header's way to the programme stays when signed in, so a member's pages never
             take What's on and booking out of reach. -->
        <template #right>
          <DocsLink />
          <AuthStatus />
          <UButton
            size="sm"
            variant="poster"
            to="/whats-on"
            class="hidden sm:inline-flex"
            data-test="header-book"
          >
            Book tickets
          </UButton>
        </template>
        <template #body>
          <UNavigationMenu
            :items="links"
            orientation="vertical"
            aria-label="My NNT"
            highlight
          />
          <UButton
            class="mt-6"
            variant="poster"
            to="/whats-on"
            block
          >
            What's on and book tickets
          </UButton>
        </template>
      </UHeader>
    </div>

    <OnShiftBar />

    <UMain class="grow">
      <!-- The strip is contained; the page is not, because every member screen already brings its
           own container. Below sm the header's menu holds the same list, by the same name (0104, 0040). -->
      <UContainer class="hidden overflow-x-auto sm:block">
        <UNavigationMenu
          :items="links"
          highlight
          aria-label="My NNT"
          class="border-b border-default w-max min-w-full"
        />
      </UContainer>
      <slot />
    </UMain>

    <SiteFooter />
  </div>
</template>
