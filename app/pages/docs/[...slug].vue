<script setup lang="ts">
import { findPageHeadline } from '@nuxt/content/utils'
import type { ContentNavigationItem } from '@nuxt/content'
import { readsCommitteeDocs } from '#shared/utils/docs-audience'
import { resolvePolicyTree, tokensInTree } from '#shared/utils/policy-tokens'
import { saysDay } from '#shared/utils/when'
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

const { account } = useAccount()
const committee = readsCommitteeDocs(account.value)

// A folder's navigation entry is a row in the collection too, and must never become a neighbour.
// Prev and next follow the sidebar, so a member is never walked into a console page (0093).
const { data: surround } = await useAsyncData(
  `docs:${route.path}:surround:${committee}`,
  () => {
    const query = queryCollectionItemSurroundings('docs', route.path, { fields: ['description'] }).where('extension', '=', 'md')
    return committee ? query : query.where('audience', '<>', 'committee')
  },
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
const askingDrift = ref(false)
const driftNote = ref('')

// It emails every IT Manager, so it asks first, with room to say what is wrong.
async function reportDrift(): Promise<void> {
  reporting.value = true
  try {
    await $fetch('/api/docs/report-drift', { method: 'POST', body: { path: route.path, note: driftNote.value.trim() || undefined } })
    askingDrift.value = false
    driftNote.value = ''
    toast.add({
      title: 'Reported',
      description: 'The IT Manager has been told this page needs a look.',
      icon: 'i-lucide-check',
      color: 'success',
    })
  }
  catch (error) {
    toast.add({ title: refusalText(error, 'That report could not be sent.'), color: 'error' })
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
          @click="askingDrift = true"
        >
          Report as out of date
        </UButton>
      </template>
    </UPageHeader>

    <UModal
      v-model:open="askingDrift"
      title="Report this page as out of date"
      description="The IT Manager gets an email naming this page and you."
    >
      <template #body>
        <UFormField
          label="What is out of date?"
          description="Optional, up to 500 characters."
        >
          <UTextarea
            v-model="driftNote"
            :maxlength="500"
            class="w-full"
            data-test="report-drift-note"
          />
        </UFormField>
      </template>
      <template #footer>
        <UButton
          data-test="report-drift-send"
          :loading="reporting"
          @click="reportDrift"
        >
          Send the report
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="askingDrift = false"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </template>
    </UModal>

    <UPageBody data-test="docs-body">
      <div class="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted">
        <UBadge
          color="neutral"
          variant="subtle"
        >
          {{ page!.module }}
        </UBadge>
        <span data-test="docs-updated">Last updated {{ saysDay(page!.updatedOn) }} by {{ page!.updatedBy }}</span>
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
