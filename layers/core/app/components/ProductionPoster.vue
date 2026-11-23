<script setup lang="ts">
// The poster in the production page's side panel (C-23): seen beside every tab, with where it stands.
// It is added, described, replaced and put to use in one place, the Media tab, so a new poster is
// never described in two boxes at once; this card says what is waiting and links there.
import { POSTER } from '../composables/useProductionMedia'

const props = defineProps<{ productionId: string }>()

const { data } = await useProductionMedia(props.productionId)
const route = useRoute()
const { t } = useT()
const waiting = computed(() => (data.value?.waiting ?? []).filter(f => f.slot === POSTER))
// What the card says about a poster not yet in use: being checked, refused, or waiting for its description.
const status = computed(() => {
  if (waiting.value.some(f => f.state === 'pending')) return { icon: 'i-lucide-loader-circle', spin: true, text: t('core.poster.checking') }
  if (waiting.value.some(f => f.state === 'ready')) return { icon: 'i-lucide-pencil', spin: false, text: t('core.poster.waiting') }
  if (waiting.value.some(f => f.state === 'rejected')) return { icon: 'i-lucide-circle-x', spin: false, text: t('core.poster.refused') }
  return null
})
const media = computed(() => ({ query: { ...route.query, tab: 'media' } }))
const onMedia = computed(() => route.query.tab === 'media')
</script>

<template>
  <SidePanel
    v-if="data"
    :title="t('core.poster.title')"
  >
    <img
      v-if="data.poster"
      :src="data.poster.url!"
      :alt="data.poster.altText ?? ''"
      class="aspect-[2/3] w-full rounded-md border border-default object-cover"
    >
    <p
      v-else-if="!status"
      class="text-sm text-muted"
    >
      {{ t('core.poster.none') }}
    </p>
    <p
      v-if="status"
      class="flex items-start gap-2 text-sm"
      role="status"
    >
      <UIcon
        :name="status.icon"
        class="mt-0.5 size-4 shrink-0 text-muted"
        :class="status.spin ? 'animate-spin' : ''"
      />
      {{ status.text }}
    </p>
    <UButton
      v-if="!onMedia"
      :label="status ? t('core.poster.open') : data.poster ? t('core.poster.change') : t('core.poster.add')"
      :to="media"
      replace
      color="neutral"
      variant="outline"
      size="sm"
      trailing-icon="i-lucide-arrow-right"
    />
  </SidePanel>
</template>
