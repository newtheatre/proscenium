<script setup lang="ts">
// A photograph under a headline. The scrim always sits between the picture and the words
// (docs/design-language.md, photography rule 1), and the subtree is dark so the text resolves for it.
withDefaults(defineProps<{
  src: string
  title: string
  description?: string
  // The pictures are backdrops, so the default is the empty alt a decorative image should carry.
  alt?: string
}>(), { description: undefined, alt: '' })
</script>

<template>
  <div
    class="dark relative isolate overflow-hidden bg-default"
    data-test="photo-hero"
  >
    <NuxtImg
      :src="src"
      :alt="alt"
      sizes="100vw"
      loading="eager"
      fetchpriority="high"
      class="absolute inset-0 -z-20 size-full object-cover"
    />
    <div
      class="nnt-scrim absolute inset-0 -z-10"
      aria-hidden="true"
    />
    <UPageHero
      :title="title"
      :description="description"
      :ui="{ title: 'nnt-headline text-highlighted', description: 'text-default' }"
    >
      <template #links>
        <slot name="links" />
      </template>
    </UPageHero>
  </div>
</template>
