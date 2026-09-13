<script setup lang="ts">
import { posterGlyph, posterTint } from '#shared/utils/listing'

// The one place a show's artwork, and its absence, is drawn. The frame is ours and what sits
// inside it is the show's, never tinted or overlaid (docs/design-language.md, photography rule 2).
const props = withDefaults(defineProps<{
  title: string
  posterUrl?: string | null
  // What the artless frame's colours are seeded from. Every caller passes this or none of them:
  // two seeding differently would give one show two frames on two pages.
  slug?: string
  // False where a heading already sits beside the frame, so nobody reads the title twice.
  titled?: boolean
  sizes?: string
}>(), { posterUrl: null, slug: '', titled: true, sizes: 'xs:90vw sm:45vw md:45vw lg:30vw xl:30vw 2xl:30vw' })

const seed = computed(() => props.slug || props.title)
const tint = computed(() => posterTint(seed.value))
const glyph = computed(() => posterGlyph(seed.value))
</script>

<template>
  <div
    v-if="posterUrl"
    class="relative aspect-[2/3] overflow-hidden bg-elevated"
    data-test="poster-frame"
  >
    <NuxtImg
      :src="posterUrl"
      :alt="`Poster for ${title}`"
      :sizes="sizes"
      format="auto"
      class="size-full object-cover"
      data-test="poster-art"
    />
  </div>

  <!-- No artwork yet: the show's own two hues and its title in the poster voice, which is a state
       and not a placeholder graphic. A band on a phone, so three cards are not three screens. -->
  <div
    v-else
    class="nnt-poster-none relative flex aspect-[5/3] items-end overflow-hidden p-5 sm:aspect-[2/3]"
    :style="{ '--poster-from': tint.from, '--poster-to': tint.to }"
    data-test="poster-none"
  >
    <UIcon
      :name="glyph"
      class="absolute end-4 top-4 size-8 text-white/60"
      aria-hidden="true"
    />
    <span
      v-if="titled"
      class="nnt-headline text-2xl text-white drop-shadow-md"
    >{{ title }}</span>
  </div>
</template>
