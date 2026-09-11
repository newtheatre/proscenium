<script setup lang="ts">
// The one place a show's artwork, and its absence, is drawn. The frame is ours and what sits
// inside it is the show's, never tinted or overlaid (docs/design-language.md, photography rule 2).
withDefaults(defineProps<{
  title: string
  posterUrl?: string | null
  sizes?: string
}>(), { posterUrl: null, sizes: 'xs:90vw sm:45vw md:45vw lg:30vw xl:30vw 2xl:30vw' })
</script>

<template>
  <div
    class="relative aspect-[2/3] overflow-hidden bg-elevated"
    data-test="poster-frame"
  >
    <NuxtImg
      v-if="posterUrl"
      :src="posterUrl"
      :alt="`Poster for ${title}`"
      :sizes="sizes"
      format="auto"
      class="size-full object-cover"
      data-test="poster-art"
    />
    <!-- No artwork yet: the title set in the poster voice, which is a state and not a placeholder
         graphic, so a real poster replaces it here and nowhere else. -->
    <div
      v-else
      class="flex size-full items-end p-5"
      data-test="poster-none"
    >
      <span class="nnt-headline text-2xl text-highlighted">{{ title }}</span>
    </div>
  </div>
</template>
