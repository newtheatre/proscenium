<script setup lang="ts">
import { saysNoSuch } from '#shared/utils/no-such'
import { resolvePolicyTree, tokensInTree } from '#shared/utils/policy-tokens'
import { saysDay } from '#shared/utils/when'
import type { PolicyValues } from '#shared/utils/policy-tokens'

// Public help, read signed out: its own collection, so nothing here reaches the operator pages
// or their gate (J-109 criterion 6, 0093).
const route = useRoute()
// Plain $fetch builds an event with no platform context, so the session never reaches it (K-131).
const request = useRequestFetch()

const { data: page } = await useAsyncData(`help:${route.path}`, () => queryCollection('help').path(route.path).first())

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: saysNoSuch('page', 'Check the address, or start from Help'), fatal: true })
}

const { data: navigation } = await useAsyncData('help:navigation', () => queryCollectionNavigation('help'))
// The collection's folder is the root of the tree; its pages are what the reader wants.
const tree = computed(() => navigation.value?.[0]?.children ?? navigation.value ?? [])

// Live values, as the policy pages quote them, so a lifetime named here is the one enforced (0012).
const { data: policy } = await useAsyncData(
  `help:${route.path}:policy`,
  () => tokensInTree(page.value?.body).length === 0
    ? Promise.resolve({ values: {} as PolicyValues })
    : request<{ values: PolicyValues }, string>(`/api/policies/values?path=${encodeURIComponent(route.path)}`),
  { watch: [page] },
)

const body = computed(() => resolvePolicyTree(page.value?.body, policy.value?.values ?? {}))

useSeoMeta({
  title: page.value.title,
  description: page.value.description,
})
</script>

<template>
  <UContainer class="py-8">
    <UPage>
      <template #left>
        <UPageAside>
          <UContentNavigation
            :navigation="tree"
            highlight
            data-test="help-nav"
          />
        </UPageAside>
      </template>

      <UPageHeader
        :title="page!.title"
        :description="page!.description"
        headline="Help"
        data-test="help-header"
      />

      <UPageBody data-test="help-body">
        <p class="mb-6 text-sm text-muted">
          Last updated {{ saysDay(page!.updatedOn) }}
        </p>

        <ContentRenderer :value="{ ...page!, body }" />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
