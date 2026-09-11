<script setup lang="ts">
// One show-night screen: the work, and the actions pinned under the thumb (K-102). The screen's
// own name goes to the layout's header, so the show title and the back arrow are never repeated.
const props = defineProps<{
  title: string
  hint?: string
  stale?: Date | number | string | null
  busy?: boolean
}>()

setNightEyebrow(() => props.title)
</script>

<template>
  <section class="mx-auto flex w-full max-w-md grow flex-col gap-4">
    <div class="flex justify-end">
      <NightStale
        :at="stale"
        :busy="busy"
      />
    </div>

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
