<!-- Choose tickets for one performance, as a page of its own (BoxOfficeChooseTickets): what a link
     from outside, a page with scripts off, and signing in in the middle of booking come back to. The
     show's own page opens the same step in a drawer. -->
<script setup lang="ts">
const { t } = useT()
const { dateTime } = useDates()
const route = useRoute()
const performanceId = computed(() => String(route.params.performance))

const { data, error } = await useAPI<{ performance: { id: string, startsAt: number, venue: string }, production: { slug: string, title: string } }>(() => `/api/box-office/book/performances/${encodeURIComponent(performanceId.value)}`, { key: `box-office:book:${performanceId.value}` })
if (error.value || !data.value) throw createError({ statusCode: 404, statusMessage: t('box-office.book.not-found'), fatal: true })
// The production's address may have changed since the link was made: go to the current one.
if (data.value.production.slug !== route.params.production)
  await navigateTo(`/book/${data.value.production.slug}/${data.value.performance.id}`, { replace: true, redirectCode: 301 })
useSeoMeta({ title: () => t('box-office.book.title', { title: data.value?.production.title ?? '' }), robots: 'noindex' })
</script>

<template>
  <UContainer v-if="data">
    <UPage>
      <UPageHeader
        :title="data.production.title"
        :description="t('box-office.book.when', { when: dateTime(data.performance.startsAt), venue: data.performance.venue })"
      />
      <UPageBody>
        <BoxOfficeChooseTickets
          :performance-id="performanceId"
          class="max-w-2xl"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
