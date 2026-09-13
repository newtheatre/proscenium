<script setup lang="ts">
// A photograph under a headline. The scrim always sits between the picture and the words
// (docs/design-language.md, photography rule 1), and the subtree is dark so the text resolves for it.
const props = withDefaults(defineProps<{
  src: string
  title: string
  description?: string
  // The pictures are backdrops, so the default is the empty alt a decorative image should carry.
  alt?: string
  // Left is the house's front page: the scrim is heaviest on that edge, so the words sit where
  // the picture is darkest rather than wherever it happens to be busy.
  align?: 'centre' | 'start'
}>(), { description: undefined, alt: '', align: 'centre' })

// Every key carries a breakpoint: a bare value files under a 1px screen and the srcset collapses
// to a two-pixel image (tests/unit/static-assets.test.ts).
const SIZES = 'xs:100vw sm:100vw md:100vw lg:100vw xl:100vw 2xl:100vw'

const heroUi = computed(() => (props.align === 'start'
  ? {
      title: 'nnt-headline text-highlighted',
      description: 'text-default',
      wrapper: 'text-left items-start',
      header: 'text-left',
      links: 'justify-start',
      container: 'max-w-2xl me-auto ms-0',
    }
  : { title: 'nnt-headline text-highlighted', description: 'text-default' }))
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
      :ui="heroUi"
    >
      <template
        v-if="$slots.title"
        #title
      >
        <slot name="title" />
      </template>
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
