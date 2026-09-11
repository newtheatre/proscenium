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

// Every key carries a breakpoint: a bare value files under a 1px screen and the srcset collapses
// to a two-pixel image (tests/unit/static-assets.test.ts).
const SIZES = 'xs:100vw sm:100vw md:100vw lg:100vw xl:100vw 2xl:100vw'
</script>

<template>
  <div
    class="dark relative isolate overflow-hidden bg-default"
    data-test="photo-hero"
  >
    <NuxtImg
      :src="src"
      :alt="alt"
      :sizes="SIZES"
      format="auto"
      loading="eager"
      fetchpriority="high"
      preload
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
      <template
        v-if="$slots.headline"
        #headline
      >
        <slot name="headline" />
      </template>
      <template
        v-if="$slots.links"
        #links
      >
        <slot name="links" />
      </template>
    </UPageHero>
  </div>
</template>
