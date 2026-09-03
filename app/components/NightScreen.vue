<script setup lang="ts">
// One show-night screen: a title, the work, and the actions pinned under the thumb (K-102). The
// freshness line always shows, because a screen with nothing loaded is the moment it matters most.
defineProps<{
  title: string
  hint?: string
  stale?: Date | number | string | null
  busy?: boolean
}>()
</script>

<template>
  <!-- The header is 3.5rem and the layout's padding 2rem, so this is the room left. Dynamic
       viewport units, because 100vh on a phone is the height with the URL bar already gone. -->
  <section class="mx-auto flex min-h-[calc(100dvh-5.5rem)] w-full max-w-md flex-col gap-4">
    <header class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h1 class="nnt-headline text-2xl">
        {{ title }}
      </h1>
      <NightStale
        :at="stale"
        :busy="busy"
      />
    </header>

    <p
      v-if="hint"
      class="text-sm text-muted"
    >
      {{ hint }}
    </p>

    <div class="grow text-base">
      <slot />
    </div>

    <!-- The bottom third of a 360 by 740 phone, which is where a thumb rests (K-102 criterion 2).
         Stacked full width, so every action clears the target floor on its own. -->
    <div
      v-if="$slots.actions"
      class="sticky bottom-0 flex flex-col gap-3 bg-default pb-4 pt-3"
    >
      <slot name="actions" />
    </div>
  </section>
</template>
