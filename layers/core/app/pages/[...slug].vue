<!-- Public pages from site/content/pages. "/" is index.md. -->
<script setup lang="ts">
const route = useRoute()
const { data: page } = await useAsyncData(`page:${route.path}`, () => queryCollection('pages').path(route.path).first())
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
useSeoMeta({ title: page.value.title, description: page.value.description })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody>
        <ContentRenderer
          v-if="page"
          :value="page"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
