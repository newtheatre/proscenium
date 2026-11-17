<!-- "Your credits" in My account, on the members' side: how many productions credit the person, and
     the way to choose who sees each. Absent for someone with no credits. -->
<script setup lang="ts">
const props = defineProps<{ headingId: string }>()
const { t } = useT()
const { data } = await useAPI<{ credits: { id: string }[] }>('/api/core/me/credits', { key: 'core:my-credits-summary' })
const count = computed(() => data.value?.credits.length ?? 0)
</script>

<template>
  <div
    v-if="count"
    class="space-y-3"
  >
    <h2
      :id="props.headingId"
      class="text-lg font-semibold text-highlighted"
    >
      {{ t('core.me.credits.title') }}
    </h2>
    <p>{{ t('core.me.credits.summary', { count }) }}</p>
    <UButton
      to="/account/credits"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-arrow-right"
      :label="t('core.me.credits.open')"
    />
  </div>
</template>
