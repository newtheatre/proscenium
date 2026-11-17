<!-- One show as a card in a list of them: what's on, the archive and the whats-on content component.
     The whole card is the link, drawn over it, so a press anywhere on the card opens the show. -->
<script setup lang="ts">
const props = defineProps<{
  to: string
  title: string
  description?: string | null
  poster?: { url: string, alt: string, width: number | null, height: number | null } | null
  /** When it is on, such as "12 Mar – 4 Apr 2031". */
  when: string
  /** Where, and what kind of show, in one line. */
  details?: string
  cancelled?: boolean
  /** The age in words, and whether the show has staging effects: shown as badges, never the content warnings. */
  age?: string | null
  effects?: boolean
  orientation?: 'vertical' | 'horizontal'
  /** What it costs, such as "From £6 · Member £4", in the currency's minor unit. */
  price?: { currency: string, fromMinor: number | null, others: { label: string, amountMinor: number }[] } | null
}>()
const { t } = useT()
const priceLine = computed(() => props.price ? priceSummary(props.price, t) : '')
</script>

<template>
  <UPageCard
    :to="to"
    :title="title"
    :description="description ?? undefined"
    :orientation="orientation ?? 'vertical'"
    variant="outline"
    class="h-full"
  >
    <template
      v-if="poster"
      #header
    >
      <img
        :src="poster.url"
        :alt="poster.alt"
        :width="poster.width ?? undefined"
        :height="poster.height ?? undefined"
        loading="lazy"
        :class="['aspect-[2/3] rounded-md object-cover', orientation === 'horizontal' ? 'w-24' : 'w-full']"
      >
    </template>
    <template #footer>
      <p class="text-sm font-medium">
        {{ when }}
        <UBadge
          v-if="cancelled"
          :label="t('public-site.production.cancelled')"
          color="neutral"
          variant="subtle"
          size="sm"
          class="ms-1"
        />
      </p>
      <p
        v-if="age || effects"
        class="mt-1 flex flex-wrap gap-1"
      >
        <UBadge
          v-if="age"
          :label="age"
          color="neutral"
          variant="outline"
          size="sm"
        />
        <UBadge
          v-if="effects"
          :label="t('public-site.production.effects-badge')"
          icon="i-lucide-zap"
          color="neutral"
          variant="outline"
          size="sm"
        />
      </p>
      <p
        v-if="details"
        class="text-sm text-muted"
      >
        {{ details }}
      </p>
      <p
        v-if="priceLine"
        class="text-sm"
      >
        {{ priceLine }}
      </p>
    </template>
  </UPageCard>
</template>
