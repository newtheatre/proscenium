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

// Two sections is a list, not a map. Below that the aside is an empty column beside the prose.
const TOC_MINIMUM = 3
const toc = computed(() => page.value?.body?.toc?.links ?? [])
const hasToc = computed(() => toc.value.length >= TOC_MINIMUM)

useSeoMeta({
  title: page.value.title,
  description: page.value.description,
})

// Home, then this page: two steps is the whole depth of the editorial site (K-125 criterion 4).
useSchemaOrg([
  defineBreadcrumb({
    itemListElement: [
      { name: 'Home', item: '/' },
      { name: page.value.title, item: route.path },
    ],
  }),
])
</script>

<template>
  <div>
    <PhotoHero
      v-if="page!.banner"
      :src="page!.banner"
      :alt="page!.bannerAlt"
      :title="page!.title"
      :description="page!.description"
      data-test="content-hero"
    />
    <!-- A page with no photograph still opens on the house rather than on a plain black band:
         the spotlight and the display face are what the site has instead of a picture. -->
    <div
      v-else
      class="dark nnt-spotlight"
      data-test="content-hero"
    >
      <UPageHero
        :title="page!.title"
        :description="page!.description"
        :ui="{
          title: 'nnt-headline text-highlighted',
          description: 'text-default',
          container: 'py-12 sm:py-14 lg:py-16',
        }"
      />
    </div>

    <UContainer class="py-12">
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

      <UPage>
        <UPageBody
          class="max-w-prose"
          data-test="content-body"
        >
          <ContentRenderer :value="{ ...page!, body }" />
        </UPageBody>

        <template
          v-if="hasToc"
          #right
        >
          <UContentToc
            highlight
            title="On this page"
            :links="toc"
            data-test="content-toc"
          />
        </template>
      </UPage>
    </UContainer>
  </div>
</template>
