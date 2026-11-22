<!-- A run's tickets, reached from Ticket set-up: the same set-up as the Tickets tab on the
     production's page in Programme, framed here so box office staff who cannot open Programme
     still reach it (Matt, 21 Nov 2026). -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

const { t } = useT()
const route = useRoute()
const id = computed(() => String(route.params.production))
const { data } = await useProductionTickets(() => id.value)
const trail = computed(() => [{ label: t('box-office.navigation.performances.label'), to: '/console/box-office/performances' }])
</script>

<template>
  <PageFrame
    :title="data ? t('box-office.run.title', { title: data.production.title }) : t('box-office.performances.run')"
    :description="t('box-office.run.description')"
    :trail="trail"
    long-title
  >
    <BoxOfficeProductionTickets :record-id="id" />
  </PageFrame>
</template>
