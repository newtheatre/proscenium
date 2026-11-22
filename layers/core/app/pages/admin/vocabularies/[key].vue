<script setup lang="ts">
// One of the theatre's own lists. A list that belongs to a module is on that module's Lists tab,
// so an old link to it here is sent there.
const route = useRoute()
const key = computed(() => String(route.params.key))
async function placed(vocabulary: { owner: string }) {
  if (vocabulary.owner !== 'theatre') await navigateTo(`/admin/modules/${vocabulary.owner}/lists/${encodeURIComponent(key.value)}`, { replace: true })
}
</script>

<template>
  <VocabularyTerms
    :list-key="key"
    :trail="[{ label: 'Lists', to: '/admin/vocabularies' }]"
    @loaded="placed"
  />
</template>
