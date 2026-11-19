<!-- NNT: upstream's show card (layers/public-site/app/components/PublicSiteShowCard.vue, same props)
     drawn as a printed poster: square, an ink ring and a hard gold shadow. The show's name stays
     under its poster. A show with no artwork yet gets the house's frame with its name on it. The
     whole card is the link to the show, where its dates and tickets are. -->
<script setup lang="ts">
const props = defineProps<{
  to: string
  title: string
  description?: string | null
  poster?: { url: string, alt: string, width: number | null, height: number | null } | null
  when: string
  details?: string
  cancelled?: boolean
  age?: string | null
  effects?: boolean
  warnings?: boolean
  orientation?: 'vertical' | 'horizontal'
  price?: PriceSummaryView | null
}>()
const { t } = useT()
const priceLine = computed(() => (props.price ? priceSummary(props.price, t) : ''))
// The artless frame's two hues come from the show's name, so a show keeps its colours.
const tint = computed(() => {
  let h = 0
  for (const c of props.title) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return { '--poster-from': h % 360, '--poster-to': (h >>> 9) % 360 }
})
</script>

<template>
  <article class="nnt-poster-card group relative flex h-full flex-col">
    <div
      v-if="poster"
      class="relative aspect-[2/3] overflow-hidden border-b-2 border-(--color-ash-950) bg-elevated"
    >
      <img
        :src="poster.url"
        :alt="poster.alt"
        :width="poster.width ?? undefined"
        :height="poster.height ?? undefined"
        loading="lazy"
        class="size-full object-cover"
      >
    </div>
    <div
      v-else
      class="nnt-poster-none relative flex aspect-[5/3] items-end overflow-hidden border-b-2 border-(--color-ash-950) p-5 sm:aspect-[2/3]"
      :style="tint"
      aria-hidden="true"
    >
      <div class="nnt-scrim absolute inset-0" />
      <UIcon
        name="i-lucide-drama"
        class="absolute end-4 top-4 size-8 text-white/60"
      />
      <span class="nnt-headline relative text-2xl text-white">{{ title }}</span>
    </div>

    <div class="flex grow flex-col gap-2 p-4">
      <h3 class="nnt-headline text-xl text-highlighted">
        <NuxtLink
          :to="to"
          class="after:absolute after:inset-0 focus-visible:outline-none"
        >{{ title }}</NuxtLink>
      </h3>
      <p class="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>{{ when }}</span>
        <UBadge
          v-if="cancelled"
          :label="t('public-site.production.cancelled')"
          color="error"
          variant="subtle"
          size="sm"
        />
        <UBadge
          v-if="details"
          :label="details"
          color="neutral"
          variant="outline"
          size="sm"
        />
      </p>
      <p
        v-if="description"
        class="line-clamp-2 text-sm"
      >
        {{ description }}
      </p>
      <p
        v-if="age || effects || warnings"
        class="flex flex-wrap gap-1"
      >
        <UBadge
          v-if="age"
          :label="age"
          color="neutral"
          variant="subtle"
          size="sm"
        />
        <UBadge
          v-if="effects"
          :label="t('public-site.production.effects-badge')"
          icon="i-lucide-zap"
          color="warning"
          variant="subtle"
          size="sm"
        />
        <UBadge
          v-if="warnings"
          :label="t('public-site.production.warnings-badge')"
          icon="i-lucide-info"
          color="warning"
          variant="subtle"
          size="sm"
        />
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-3 border-t-2 border-(--color-ash-950) p-4">
      <span
        v-if="!cancelled"
        class="rounded-md bg-primary px-2.5 py-1.5 text-sm font-semibold text-inverted group-hover:bg-primary/90"
        aria-hidden="true"
      >Book tickets</span>
      <span
        v-if="priceLine"
        class="text-sm font-medium"
      >{{ priceLine }}</span>
    </div>
  </article>
</template>
