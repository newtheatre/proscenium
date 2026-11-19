<!-- NNT: upstream's content page (layers/core/app/pages/[...slug].vue), opening on the house: the
     page's photograph under the scrim when its front matter names a `banner`, the spotlight when it
     does not. The body keeps to a reading width, with the page's sections beside it from lg. -->
<script setup lang="ts">
const route = useRoute()
const { data: page } = await useAsyncData(`page:${route.path}`, () => queryCollection('pages').path(route.path).first())
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
// A page still holding starter text, or one marked noindex, is kept from search engines (C-42).
useSeoMeta({ title: page.value.title, description: page.value.description, robots: page.value.placeholder || page.value.noindex ? 'noindex' : undefined })
const banner = computed(() => {
  const b = (page.value?.meta as { banner?: unknown } | undefined)?.banner
  return typeof b === 'string' ? b : null
})
const toc = computed(() => page.value?.body?.toc?.links ?? [])
</script>

<template>
  <div v-if="page">
    <NntHero
      :src="banner"
      :title="page.title"
      :description="page.description"
      :compact="!banner"
    />
    <UContainer class="py-12">
      <UPage>
        <UPageBody class="max-w-prose">
          <ContentRenderer :value="page" />
        </UPageBody>
        <template
          v-if="toc.length > 1"
          #right
        >
          <UContentToc
            highlight
            title="On this page"
            :links="toc"
          />
        </template>
      </UPage>
    </UContainer>
  </div>
</template>
