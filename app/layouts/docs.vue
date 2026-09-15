<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'

// Reading, not work: the member shell's chrome with a tree beside the page (0076). The tree is
// fetched here rather than in app.vue, since only these routes may read the docs collection.
const { data: fetched } = await useAsyncData('docs:navigation', () => queryCollectionNavigation('docs', ['description']))
// The collection's folder is the root of the tree; the sections are what the reader wants.
const navigation = computed<ContentNavigationItem[]>(() => fetched.value?.[0]?.children ?? fetched.value ?? [])
provide('navigation', navigation)

// The search index is the whole collection, so it is loaded once, in the browser, when asked for.
const { data: sections } = useLazyAsyncData('docs:search', () => queryCollectionSearchSections('docs'), { server: false })
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <div class="dark">
      <UHeader
        title="The Nottingham New Theatre"
        :ui="{ root: 'bg-default' }"
      >
        <template #title>
          <SiteWordmark />
        </template>
        <template #right>
          <UContentSearchButton
            collapsed
            aria-label="Search the documentation"
            data-test="docs-search"
          />
          <AuthStatus />
        </template>
        <template #body>
          <UContentNavigation
            :navigation="navigation"
            default-open
            highlight
            data-test="docs-nav-mobile"
          />
        </template>
      </UHeader>
    </div>

    <UMain class="grow">
      <UContainer>
        <UPage>
          <template #left>
            <!-- default-open opens the section holding the page and no other, so twelve sections
                 stay one screen of sidebar. -->
            <UPageAside>
              <UContentNavigation
                :navigation="navigation"
                default-open
                highlight
                data-test="docs-nav"
              />
            </UPageAside>
          </template>
          <slot />
        </UPage>
      </UContainer>
    </UMain>

    <ClientOnly>
      <LazyUContentSearch
        :files="sections ?? []"
        :navigation="navigation"
        placeholder="Search the documentation"
      />
    </ClientOnly>

    <SiteFooter />
  </div>
</template>
