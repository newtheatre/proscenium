<!-- Public pages from site/content/pages. "/" is index.md. -->
<script setup lang="ts">
const route = useRoute()
const { data: page } = await useAsyncData(`page:${route.path}`, () => queryCollection('pages').path(route.path).first())
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
useSeoMeta({ title: page.value.title, description: page.value.description })
// A page that opens with its own heading keeps it; one that does not gets its title as the heading.
const ownHeading = computed(() => (page.value?.body?.value ?? []).some(node => Array.isArray(node) && node[0] === 'h1'))
</script>

<template>
  <UContainer>
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
