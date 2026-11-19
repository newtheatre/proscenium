<!-- The house's hero: a photograph under a scrim, or the spotlight on stage black where there is
     none, with the headline in the display face. The picture is always decorative (empty alt): the
     headline is what the page says. -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  src?: string | null
  title?: string
  description?: string | null
  align?: 'centre' | 'start'
  /** A band rather than a hero. */
  compact?: boolean
}>(), { src: null, title: undefined, description: null, align: 'centre', compact: false })

const ui = computed(() => ({
  title: 'nnt-headline text-highlighted text-5xl sm:text-7xl',
  description: 'text-default',
  ...(props.align === 'start' ? { wrapper: 'max-w-2xl text-left items-start', header: 'text-left', links: 'justify-start' } : {}),
  ...(props.compact ? { container: 'py-10 sm:py-12 lg:py-14' } : {}),
}))
</script>

<template>
  <div :class="['dark relative isolate overflow-hidden', src ? 'bg-default' : 'nnt-spotlight']">
    <template v-if="src">
      <img
        :src="src"
        alt=""
        fetchpriority="high"
        class="absolute inset-0 -z-20 size-full object-cover"
      >
      <div
        class="nnt-scrim absolute inset-0 -z-10"
        aria-hidden="true"
      />
    </template>
    <UPageHero
      :title="title"
      :description="description ?? undefined"
      :ui="ui"
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
