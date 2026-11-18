<!-- The versions of a policy that have been in force, newest first, so anyone can read the words as
     they were when they agreed to them. -->
<script setup lang="ts">
interface Versions { policy: { id: string, title: string }, versions: { number: number, createdAt: number }[] }

const { t } = useT()
const { day } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data } = await useAPI<Versions>(() => `/api/core/policies/${encodeURIComponent(id.value)}/versions`, { key: `core:policy-versions:${id.value}` })
if (!data.value) throw createError({ statusCode: 404, statusMessage: t('core.policies.not-found'), fatal: true })
useSeoMeta({ title: () => t('core.policies.versions.title', { policy: data.value?.policy.title ?? '' }), robots: 'noindex' })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="t('core.policies.versions.title', { policy: data?.policy.title ?? '' })"
        :description="t('core.policies.versions.description')"
        :links="[{ label: t('core.policies.versions.current'), to: `/policies/${id}`, variant: 'outline', color: 'neutral' }]"
      />
      <UPageBody>
        <UEmpty
          v-if="!data?.versions.length"
          icon="i-lucide-history"
          :title="t('core.policies.versions.none')"
        />
        <UPageList
          v-else
          divide
        >
          <UPageCard
            v-for="version in data.versions"
            :key="version.number"
            :title="t('core.policies.versions.from', { date: day(version.createdAt) })"
            :description="t('core.policies.versions.number', { number: version.number })"
            :to="`/policies/${id}/versions/${version.number}`"
            variant="ghost"
          />
        </UPageList>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
