<script setup lang="ts">
import { SHOW_TABS, showTab } from '#shared/utils/show-tabs'
import { saysShowStatus } from '#shared/utils/programme'
import type { AdminPerformance, AdminShow, ShowReference, ShowVenue } from '#shared/utils/programme'
import type { ContentWarning, ShowContentWarning } from '#shared/utils/content-warnings'

definePageMeta({ layout: 'console', title: 'Show', middleware: 'console' })

const route = useRoute()
const router = useRouter()
const request = useRequestFetch()
const toast = useToast()
const id = computed(() => String(route.params.id))

interface Detail {
  show: AdminShow
  performances: AdminPerformance[]
  venues: ShowVenue[]
  categories: ShowReference[]
  seasons: ShowReference[]
  warnings: ShowContentWarning[]
  vocabulary: ContentWarning[]
}

const failure = ref<string | null>(null)
const saving = ref(false)

const { data, error, refresh } = await useAsyncData(
  () => `box-office-show-${id.value}`,
  () => request<Detail>(`/api/admin/shows/${id.value}`),
)

const show = computed(() => data.value?.show ?? null)
const performances = computed(() => data.value?.performances ?? [])
const venues = computed(() => data.value?.venues ?? [])
const categories = computed(() => data.value?.categories ?? [])
const seasons = computed(() => data.value?.seasons ?? [])
const warnings = computed(() => data.value?.warnings ?? [])
const vocabulary = computed(() => data.value?.vocabulary ?? [])

// One section at a time, named in the URL so a link opens where it says (D-132 criterion 1).
const active = computed({
  get: () => showTab(route.query.tab),
  set: (tab: string) => {
    void router.push({ query: { ...route.query, tab } })
  },
})

const publishing = ref(false)
const cascade = ref(true)

async function setPublished(published: boolean): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    const answer = await $fetch<{ performancesTakenOnSale: number }>(`/api/admin/shows/${id.value}/publish`, {
      method: 'POST',
      body: { published, cascadePerformances: published && cascade.value },
    })
    toast.add({
      title: published ? 'Show published' : 'Show taken off the public site',
      description: published
        ? `${plural(answer.performancesTakenOnSale, 'performance', 'performances')} put on sale.`
        : 'Sales are closed. Nothing sold has been touched.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    publishing.value = false
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const removingShow = ref(false)

async function deleteShow(): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/shows/${id.value}`, { method: 'DELETE' })
    toast.add({ title: 'Show deleted', icon: 'i-lucide-check', color: 'success' })
    await navigateTo('/box-office/shows')
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const loadFailure = computed(() => (error.value ? refusalText(error.value, 'The show could not be read.') : null))
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="loadFailure"
      data-test="load-failure"
      color="error"
      variant="subtle"
      :description="loadFailure"
    />

    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <template v-if="show">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">
            {{ show.title }}
          </h2>
          <p class="text-sm text-muted">
            /shows/{{ show.slug }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :color="show.status === 'PUBLISHED' ? 'success' : 'neutral'"
            variant="subtle"
            data-test="show-status"
          >
            {{ saysShowStatus(show.status) }}
          </UBadge>
          <UButton
            v-if="show.status === 'DRAFT'"
            data-test="publish"
            icon="i-lucide-globe"
            @click="publishing = true"
          >
            Publish
          </UButton>
          <UButton
            v-else
            color="neutral"
            variant="outline"
            data-test="unpublish"
            @click="setPublished(false)"
          >
            Take off the site
          </UButton>
          <UButton
            v-if="show.soldTickets === 0"
            color="error"
            variant="ghost"
            data-test="delete-show"
            @click="removingShow = true"
          >
            Delete
          </UButton>
        </div>
      </div>

      <UTabs
        v-model="active"
        :content="false"
        :items="SHOW_TABS"
        :ui="{ label: 'hidden sm:inline' }"
        class="w-full"
        data-test="show-tabs"
      />

      <BoxOfficeShowDetails
        v-if="active === 'details'"
        :show="show"
        :categories="categories"
        :seasons="seasons"
        @saved="refresh()"
      />

      <BoxOfficeShowPerformances
        v-else-if="active === 'performances'"
        :show="show"
        :performances="performances"
        :venues="venues"
        @changed="refresh()"
      />

      <BoxOfficeShowTicketTypes
        v-else-if="active === 'ticket-types'"
        :show="show"
      />

      <BoxOfficeShowWarnings
        v-else-if="active === 'warnings'"
        :show-id="show.id"
        :warnings="warnings"
        :vocabulary="vocabulary"
        :confirmed-none="show.warningsConfirmedNone"
        @saved="refresh()"
      />

      <BoxOfficeShowSales
        v-else
        :performances="performances"
      />
    </template>

    <UModal
      v-model:open="publishing"
      title="Publish this show"
      description="The public page goes live. Performances still off sale can go on sale with it."
    >
      <template #body>
        <div class="space-y-4">
          <USwitch
            v-model="cascade"
            label="Put its performances on sale too"
            description="Cancelled performances are left alone."
            data-test="cascade"
          />
          <UButton
            :loading="saving"
            data-test="confirm-publish"
            @click="setPublished(true)"
          >
            Publish it
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="removingShow"
      title="Delete this show"
      description="Nothing has ever been sold under it, so there is no history to keep. Its performances and prices go with it."
    >
      <template #body>
        <p class="text-sm text-muted">
          This cannot be undone, and there is nothing behind it to lose.
        </p>
      </template>

      <template #footer>
        <UButton
          color="error"
          :loading="saving"
          data-test="confirm-delete-show"
          @click="deleteShow"
        >
          Delete it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="removingShow = false"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </div>
</template>
