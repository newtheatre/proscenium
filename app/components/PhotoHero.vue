<script setup lang="ts">
// A photograph under a headline. The scrim always sits between the picture and the words
// (docs/design-language.md, photography rule 1), and the subtree is dark so the text resolves for it.
const props = withDefaults(defineProps<{
  src: string
  // Absent only when the `title` slot carries the headline instead, as a title with a word of
  // its own colour in it must.
  title?: string
  description?: string
  // The pictures are backdrops, so the default is the empty alt a decorative image should carry.
  alt?: string
  // Left is the house's front page: the scrim is heaviest on that edge, so the words sit where
  // the picture is darkest rather than wherever it happens to be busy.
  align?: 'centre' | 'start'
  // A band rather than a hero: the listing leads with its shows, not with a photograph.
  compact?: boolean
}>(), { title: undefined, description: undefined, alt: '', align: 'centre', compact: false })

// Every key carries a breakpoint: a bare value files under a 1px screen and the srcset collapses
// to a two-pixel image (tests/unit/static-assets.test.ts).
const SIZES = 'xs:100vw sm:100vw md:100vw lg:100vw xl:100vw 2xl:100vw'

const PADDING = 'py-10 sm:py-12 lg:py-14'

// The width cap goes on the wrapper, never the container: a cap on the container replaces the
// site's own, so on a wide screen the words leave the column the rest of the page keeps.
const heroUi = computed(() => ({
  title: 'nnt-headline text-highlighted',
  description: 'text-default',
  ...(props.align === 'start'
    ? { wrapper: 'max-w-2xl text-left items-start', header: 'text-left', links: 'justify-start' }
    : {}),
  ...(props.compact ? { container: PADDING } : {}),
}))
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
        v-if="$slots.headline"
        #headline
      >
        <slot name="headline" />
      </template>
      <template
        v-if="$slots.title"
        #title
      >
        <slot name="title" />
      </template>
      <template
        v-if="$slots.description"
        #description
      >
        <slot name="description" />
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
