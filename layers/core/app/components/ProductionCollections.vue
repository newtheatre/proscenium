<!-- The collections a production is in (C-60), chosen together from a list. A collection bound to a
     season offers itself only to that season's productions (CL1). Saved at once, with Undo. -->
<script setup lang="ts">
interface Collection { id: string, name: string, colour: string, seasonId: string | null, season: string | null, state: 'draft' | 'published' | 'archived' }

const props = defineProps<{ productionId: string, seasonId: string | null }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { offer } = useUndo()
const { toRefusal } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const { data: all } = await useAPI<{ collections: Collection[] }>('/api/core/collections', { key: 'core:collections' })
const { data: mine, refresh } = await useAPI<{ collections: { id: string }[] }>(() => `/api/core/productions/${props.productionId}/collections`, { key: `core:production:${props.productionId}:collections` })
const chosen = computed(() => (mine.value?.collections ?? []).map(c => c.id))
const items = computed(() => (all.value?.collections ?? [])
  .filter(c => (c.state !== 'archived' && (!c.seasonId || c.seasonId === props.seasonId)) || chosen.value.includes(c.id))
  .map(c => ({ value: c.id, label: c.season ? `${c.name} (${c.season})` : c.name })))
const shown = computed(() => (all.value?.collections ?? []).filter(c => chosen.value.includes(c.id)))

const put = (collectionIds: string[]) => $api(`/api/core/productions/${props.productionId}/collections` as string, { method: 'PUT', body: { collectionIds } })
async function choose(ids: string[]) {
  const before = chosen.value
  refusal.value = null
  try {
    await put(ids)
    await refresh()
    offer(t('core.collections.production-saved'), async () => {
      await put(before)
      await refresh()
    })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageSection
    :title="t('core.collections.title')"
    :description="t('core.collections.production-help')"
  >
    <div class="space-y-3">
      <RefusalNotice :refusal="refusal" />
      <USelectMenu
        :model-value="chosen"
        :items="items"
        value-key="value"
        multiple
        :search-input="{ placeholder: t('core.collections.search') }"
        :placeholder="t('core.collections.none-chosen')"
        :aria-label="t('core.collections.title')"
        @update:model-value="choose($event as string[])"
      />
      <div
        v-if="shown.length"
        class="flex flex-wrap gap-2"
      >
        <CollectionChip
          v-for="c in shown"
          :key="c.id"
          :name="c.name"
          :colour="c.colour"
          :to="`/console/programme/collections/${c.id}`"
        />
      </div>
    </div>
  </PageSection>
</template>
