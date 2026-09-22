<script setup lang="ts">
import { SHOW_TABS, showTab } from '#shared/utils/show-tabs'
import { saysShowStatus } from '#shared/utils/programme'
import type { AdminPerformance, AdminShow, ShowReference, ShowVenue } from '#shared/utils/programme'
import type { ContentWarning, ShowContentWarning } from '#shared/utils/content-warnings'

definePageMeta({ layout: 'console', title: 'Show', middleware: 'console', docs: '/docs/box-office/shows' })

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

// Details holds typed copy and unmounts when another section opens (D-132 criterion 9).
const details = useDiscardGuard()

// One section at a time, named in the URL so a link opens where it says (D-132 criterion 1).
const active = computed({
  get: () => showTab(route.query.tab),
  set: (tab: string) => {
    if (tab === showTab(route.query.tab)) return
    const move = (): void => void router.push({ query: { ...route.query, tab } })
    if (showTab(route.query.tab) !== 'details' || !details.hold(move)) move()
  },
})

const publishing = ref(false)
const cascade = ref(true)

// Taking a show off sale is not destruction, so the confirmation is primary rather than error
// (K-123 criterion 7). Its refusal stays in the dialogue, not on the page behind it.
const unpublishing = ref(false)
const unpublishFailure = ref<string | null>(null)

async function takeOffSale(): Promise<void> {
  unpublishFailure.value = null
  await setPublished(false, (message) => {
    unpublishFailure.value = message
  })
  if (!unpublishFailure.value) unpublishing.value = false
}

async function setPublished(published: boolean, refuse?: (message: string) => void): Promise<void> {
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
    if (refuse) refuse(refusalText(refused))
    else failure.value = refusalText(refused)
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
            v-if="show.status === 'PUBLISHED'"
            color="neutral"
            variant="ghost"
            icon="i-lucide-external-link"
            :to="`/shows/${show.slug}`"
            target="_blank"
            data-test="preview-public"
          >
            Preview public page
          </UButton>
          <UButton
            v-if="show.status === 'DRAFT'"
            data-test="publish"
            icon="i-lucide-globe"
            @click="publishing = true"
          >
            Publish
          </UButton>
        </div>
      </div>

      <BoxOfficeShowStatusStrip :show="show" />

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div class="space-y-6">
          <UTabs
            v-model="active"
            :content="false"
            :items="SHOW_TABS"
            :ui="{ label: 'sr-only sm:not-sr-only sm:inline' }"
            class="w-full"
            data-test="show-tabs"
          />

          <BoxOfficeShowDetails
            v-if="active === 'details'"
            :show="show"
            :categories="categories"
            :seasons="seasons"
            @saved="refresh()"
            @changed="value => details.changed.value = value"
          />

          <BoxOfficeShowPerformances
            v-else-if="active === 'performances'"
            :show="show"
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
            :content-notes="show.contentNotes"
            @saved="refresh()"
          />

          <BoxOfficeShowSales
            v-else
            :performances="performances"
          />
        </div>

        <!-- Always in view whichever section is open: the poster, what is still outstanding and
             the two actions that take a show away from the public (D-132 criteria 6 to 8). -->
        <div class="space-y-6">
          <BoxOfficeShowPoster
            :show="show"
            @changed="refresh()"
          />
          <BoxOfficeShowChecklist :show="show" />
          <BoxOfficeShowDangerZone
            :show="show"
            :busy="saving"
            @unpublish="unpublishFailure = null; unpublishing = true"
            @remove="removingShow = true"
          />
        </div>
      </div>
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
        </div>
      </template>

      <template #footer>
        <UButton
          :loading="saving"
          data-test="confirm-publish"
          @click="setPublished(true)"
        >
          Publish the show
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="publishing = false"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="removingShow"
      title="Delete this show"
      description="Nothing has ever been sold under it, so there is no history to keep. Its performances and prices go with it."
    >
      <template #body>
        <p class="text-sm text-muted">
          The show, its performances and its prices go. Nothing else is touched, and there is no
          booking to lose.
        </p>
      </template>

      <template #footer>
        <UButton
          color="error"
          :loading="saving"
          data-test="confirm-delete-show"
          @click="deleteShow"
        >
          Delete the show
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="removingShow = false"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </template>
    </UModal>

    <ConfirmModal
      v-model:open="unpublishing"
      name="take-off-sale"
      :title="show ? `Take ${show.title} off sale` : ''"
      :verb="show ? `Take ${show.title} off sale` : ''"
      consequence="The public page comes down. Bookings already made are kept."
      color="primary"
      :loading="saving"
      :failure="unpublishFailure"
      @confirm="takeOffSale"
    />

    <ConfirmModal
      v-model:open="details.asking.value"
      name="discard-details"
      title="Leave the details unsaved"
      verb="Discard the changes"
      consequence="The details you have typed are not saved yet. Going back leaves them where they are."
      @confirm="details.discard()"
    />
  </div>
</template>
