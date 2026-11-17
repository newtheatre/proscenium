<!-- The public roll of honour: everybody holding a listed award, by award type. "Not found" while
     the roll is not public. -->
<script setup lang="ts">
const { t } = useT()
// The same request the component makes, so the page can answer "not found" before it draws.
const { data } = await useAPI('/api/awards/roll', { key: 'awards:roll:all', query: {} })
if (!data.value) throw createError({ statusCode: 404, statusMessage: t('awards.roll.not-found'), fatal: true })
useSeoMeta({ title: () => t('awards.roll.title'), description: () => t('awards.roll.description') })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="t('awards.roll.title')"
        :description="t('awards.roll.description')"
      />
      <UPageBody>
        <AwardsRoll />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
