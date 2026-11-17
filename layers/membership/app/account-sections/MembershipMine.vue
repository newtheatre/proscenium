<!-- "Membership" in My account, on the audience side, so anyone can find how to join (tab 5). -->
<script setup lang="ts">
const props = defineProps<{ headingId: string }>()
const { t } = useT()
const { data } = await useAPI<{ memberships: { id: string, schemeName: string, status: string }[] }>('/api/membership/mine', { key: 'membership:mine' })
const current = computed(() => (data.value?.memberships ?? []).filter(m => m.status === 'current' || m.status === 'in-grace'))
</script>

<template>
  <div class="space-y-3">
    <h2
      :id="props.headingId"
      class="text-lg font-semibold text-highlighted"
    >
      {{ t('membership.navigation.mine.label') }}
    </h2>
    <p v-if="current.length">
      {{ t('membership.screens.mine.holding', { schemes: current.map(m => m.schemeName).join(', ') }) }}
    </p>
    <p v-else>
      {{ t('membership.screens.mine.none') }}
    </p>
    <UButton
      to="/account/membership"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-arrow-right"
      :label="t('membership.screens.mine.open')"
    />
  </div>
</template>
