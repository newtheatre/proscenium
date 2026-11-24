<!-- Public pages from site/content/pages. "/" is index.md, unless a module provides the front page
     while a condition holds (C-71), such as a festival's. -->
<script setup lang="ts">
const route = useRoute()
const shape = usePublicShape()
const { vueApp } = useNuxtApp()
const front = computed(() => route.path === '/' && shape.value?.frontPage ? vueApp.component(shape.value.frontPage) ?? null : null)
const { data: page } = await useAsyncData(`page:${route.path}`, () => front.value ? Promise.resolve(null) : queryCollection('pages').path(route.path).first())
if (!page.value && !front.value) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
// A page still holding starter text, or one marked noindex, is kept from search engines (C-42).
if (page.value) useSeoMeta({ title: page.value.title, description: page.value.description, robots: page.value.placeholder || page.value.noindex ? 'noindex' : undefined })
// A page that opens with its own heading keeps it; one that does not gets its title as the heading.
const ownHeading = computed(() => (page.value?.body?.value ?? []).some(node => Array.isArray(node) && node[0] === 'h1'))
</script>

<template>
  <component
    :is="front"
    v-if="front"
  />
  <UContainer v-else>
    <UPage>
      <UPageHeader
        v-if="page?.title && !ownHeading"
        :title="page.title"
        :description="page.description"
      />
      <UPageBody>
        <ContentRenderer
          v-if="page"
          :value="page"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
