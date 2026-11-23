<!-- One version of a policy, word for word as it read then. It is stored as plain Markdown with
     every value filled in, so nothing on this page follows today's settings. -->
<script setup lang="ts">
interface Version { policy: string, number: number, title: string, body: string, createdAt: number }

const { t } = useT()
const { day } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))
const number = computed(() => String(route.params.number))
const { data } = await useAPI<Version>(() => `/api/core/policies/${encodeURIComponent(id.value)}/versions/${encodeURIComponent(number.value)}`, { key: `core:policy-version:${id.value}:${number.value}` })
if (!data.value) throw createError({ statusCode: 404, statusMessage: t('core.policies.not-found'), fatal: true })
// The stored text opens with the policy's title as a heading, which the page's own header shows.
const body = computed(() => (data.value?.body ?? '').replace(/^# .*\n+/, ''))
useSeoMeta({ title: () => data.value?.title, robots: 'noindex' })
</script>

<template>
  <PageFrame
    :title="data?.title ?? ''"
    :description="t('core.policies.versions.from', { date: day(data?.createdAt ?? 0) })"
  >
    <template #primary>
      <UButton
        :label="t('core.policies.versions.current')"
        :to="`/policies/${id}`"
        color="neutral"
        variant="outline"
      />
    </template>
    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-history"
      :title="t('core.policies.versions.old')"
    />
    <MDC
      :value="body"
      :cache-key="`policy-${id}-${number}`"
    />
  </PageFrame>
</template>
