<script setup lang="ts">
import { findPageHeadline } from '@nuxt/content/utils'
import type { ContentNavigationItem } from '@nuxt/content'
import { resolvePolicyTree, tokensInTree } from '#shared/utils/policy-tokens'
import type { PolicyValues } from '#shared/utils/policy-tokens'

// One page per screen, signed in only: it names permissions, thresholds and internal screens
// that have no reason to be on the public site (J-109, 0076). The index is content/docs/index.md.
definePageMeta({ layout: 'docs', middleware: 'signed-in' })

const route = useRoute()
const toast = useToast()
// Plain $fetch builds an event with no platform context, so the session never reaches it (K-131).
const request = useRequestFetch()
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const { data: page } = await useAsyncData(`docs:${route.path}`, () => queryCollection('docs').path(route.path).first())

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

// A folder's navigation entry is a row in the collection too, and must never become a neighbour.
const { data: surround } = await useAsyncData(
  `docs:${route.path}:surround`,
  () => queryCollectionItemSurroundings('docs', route.path, { fields: ['description'] }).where('extension', '=', 'md'),
)

// Live values, the same way the policy pages quote them, so a threshold named here is the one
// enforced (0012).
const { data: policy } = await useAsyncData(
  `docs:${route.path}:policy`,
  () => tokensInTree(page.value?.body).length === 0
    ? Promise.resolve({ values: {} as PolicyValues })
    : request<{ values: PolicyValues }, string>(`/api/policies/values?path=${encodeURIComponent(route.path)}`),
  { watch: [page] },
)

const body = computed(() => resolvePolicyTree(page.value?.body, policy.value?.values ?? {}))

const TOC_MINIMUM = 3
const toc = computed(() => page.value?.body?.toc?.links ?? [])
const hasToc = computed(() => toc.value.length >= TOC_MINIMUM)

const headline = computed(() => findPageHeadline(navigation?.value ?? [], route.path))

const reporting = ref(false)

async function reportDrift(): Promise<void> {
  reporting.value = true
  try {
    await $fetch('/api/docs/report-drift', { method: 'POST', body: { path: route.path } })
    toast.add({
      title: 'Reported',
      description: 'The IT Manager has been told this page needs a look.',
      icon: 'i-lucide-check',
      color: 'success',
    })
  }
  finally {
    reporting.value = false
  }
}

useSeoMeta({
  title: page.value.title,
  description: page.value.description,
})
</script>

<template>
  <UPage>
    <UPageHeader
      :title="page!.title"
      :description="page!.description"
      :headline="headline"
      data-test="docs-header"
    >
      <template #links>
        <UButton
          data-test="report-drift"
          color="neutral"
          variant="subtle"
          icon="i-lucide-flag"
          size="sm"
          :loading="reporting"
          @click="reportDrift"
        >
          Report as out of date
        </UButton>
      </template>
    </UPageHeader>

    <UPageBody data-test="docs-body">
      <div class="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted">
        <UBadge
          color="neutral"
          variant="subtle"
        >
          {{ page!.module }}
        </UBadge>
        <span data-test="docs-updated">Last updated {{ page!.updatedOn }} by {{ page!.updatedBy }}</span>
      </div>

      <ContentRenderer :value="{ ...page!, body }" />

      <USeparator v-if="surround?.length" />

      <UContentSurround
        v-if="surround?.length"
        :surround="surround"
      />
    </UPageBody>

    <template
      v-if="hasToc"
      #right
    >
      <UContentToc
        highlight
        title="On this page"
        :links="toc"
        data-test="docs-toc"
      />
    </template>
  </UPage>
</template>
