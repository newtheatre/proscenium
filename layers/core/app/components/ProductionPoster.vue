<script setup lang="ts">
// The poster in the production page's side panel (C-23): seen beside every tab, with where it stands.
// It is added, described, replaced and put to use in one place, the Media tab, so a new poster is
// never described in two boxes at once; this card says what is waiting and links there.
import { POSTER } from '../composables/useProductionMedia'

const props = defineProps<{ productionId: string }>()

const { data } = await useProductionMedia(props.productionId)
const route = useRoute()
const waiting = computed(() => (data.value?.waiting ?? []).filter(f => f.slot === POSTER))
// What the card says about a poster not yet in use: being checked, refused, or waiting for its description.
const status = computed(() => {
  if (waiting.value.some(f => f.state === 'pending')) return { icon: 'i-lucide-loader-circle', spin: true, text: 'Checking the new poster…' }
  if (waiting.value.some(f => f.state === 'ready')) return { icon: 'i-lucide-pencil', spin: false, text: 'A new poster is waiting for its description.' }
  if (waiting.value.some(f => f.state === 'rejected')) return { icon: 'i-lucide-circle-x', spin: false, text: 'The new poster was refused.' }
  return null
})
const media = computed(() => ({ query: { ...route.query, tab: 'media' } }))
const onMedia = computed(() => route.query.tab === 'media')
</script>

<template>
  <section
    v-if="data"
    aria-labelledby="side-poster-heading"
    class="space-y-3 rounded-lg border border-default p-4"
  >
    <h2
      id="side-poster-heading"
      class="text-sm font-semibold text-highlighted"
    >
      Poster
    </h2>
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
      No poster yet.
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
      :label="status ? 'Open the Media tab' : data.poster ? 'Change on the Media tab' : 'Add on the Media tab'"
      :to="media"
      replace
      color="neutral"
      variant="outline"
      size="sm"
      trailing-icon="i-lucide-arrow-right"
    />
  </section>
</template>
