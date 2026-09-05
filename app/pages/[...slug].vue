<script setup lang="ts">
// The one route every editorial and policy page renders through (D-103, J-110): a markdown file
// under content/ at this path is a page, and a path with none is a 404, not a blank screen.
const route = useRoute()

const { data: page } = await useAsyncData(`content:${route.path}`, () => queryCollection('content').path(route.path).first())

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

useSeoMeta({
  title: page.value.title,
  description: page.value.description,
})
</script>

<template>
  <div>
    <UPageHero
      :title="page!.title"
      :description="page!.description"
    />

    <UContainer class="pb-16">
      <UAlert
        v-if="page!.placeholder"
        data-test="placeholder-banner"
        color="warning"
        variant="subtle"
        icon="i-lucide-pencil"
        title="Awaiting committee copy"
        description="This page is a placeholder. It is not yet the committee's own words, and nothing on it should be read as fact."
        class="mb-8"
      />

      <ContentRenderer :value="page!" />
    </UContainer>
  </div>
</template>
