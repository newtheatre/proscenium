<script setup lang="ts">
import { resolvePolicyTree, tokensInTree } from '#shared/utils/policy-tokens'
import type { PolicyValues } from '#shared/utils/policy-tokens'

// The one route every editorial and policy page renders through (D-103, J-110): a markdown file
// under content/ at this path is a page, and a path with none is a 404, not a blank screen.
const route = useRoute()

const { data: page } = await useAsyncData(`content:${route.path}`, () => queryCollection('content').path(route.path).first())

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

// Fetched per request rather than baked into the markdown, so changing a setting changes the page
// with no content edit (0012, J-110 criterion 2).
const { data: policy } = await useAsyncData(
  `policy:${route.path}`,
  () => tokensInTree(page.value?.body).length === 0
    ? Promise.resolve({ values: {} as PolicyValues })
    : $fetch<{ values: PolicyValues }, string>(`/api/policies/values?path=${encodeURIComponent(route.path)}`),
  { watch: [page] },
)

const body = computed(() => resolvePolicyTree(page.value?.body, policy.value?.values ?? {}))

useSeoMeta({
  title: page.value.title,
  description: page.value.description,
})
</script>

<template>
  <div>
    <PhotoHero
      v-if="page!.banner"
      :src="page!.banner"
      :alt="page!.bannerAlt"
      :title="page!.title"
      :description="page!.description"
    />
    <UPageHero
      v-else
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

      <ContentRenderer :value="{ ...page!, body }" />
    </UContainer>
  </div>
</template>
