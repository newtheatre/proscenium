<!-- Your companies' card on My account (CO-08), shown only to a live contact: the companies, and how many things wait on them. -->
<script setup lang="ts">
const props = defineProps<{ headingId: string }>()
const { t } = useT()
const { data } = await useMyCompanies()
const companies = computed(() => [...new Set((data.value?.engagements ?? []).map(e => e.company))])
const owed = computed(() => (data.value?.engagements ?? []).reduce((n, e) => n + e.toDo.length, 0))
</script>

<template>
  <AccountCard
    :heading-id="props.headingId"
    :title="t('companies.navigation.mine.label')"
    :description="owed ? t('companies.mine.waiting', { count: owed }) : (companies.join(', ') || t('companies.mine.nothing-yet'))"
    to="/account/companies"
    icon="i-lucide-building-2"
  />
</template>
