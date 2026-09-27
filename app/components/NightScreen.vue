<script setup lang="ts">
// One show-night screen: the work, and the actions pinned under the thumb (K-102). The screen's
// own name goes to the layout's header, so the show title and the back arrow are never repeated.
const props = defineProps<{
  title: string
  hint?: string
  stale?: Date | number | string | null
  busy?: boolean
  // Set when this screen refused the viewer: one card in place of the work, and no live controls
  // left to press (issue 1304, docs/design-language.md Chrome rule 4).
  refused?: string | null
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

    <NightRefusal
      v-if="refused"
      :says="refused"
    />

    <p
      v-if="hint && !refused"
      class="text-sm text-muted"
      data-test="night-hint"
    >
      {{ hint }}
    </p>

    <div
      v-if="!refused"
      class="grow text-base"
    >
      <slot />
    </div>

    <!-- The bottom third of a 360 by 740 phone, which is where a thumb rests (K-102 criterion 2).
         Stacked full width, so every action clears the target floor on its own. -->
    <div
      v-if="$slots.actions && !refused"
      class="sticky bottom-0 flex flex-col gap-3 bg-default pb-4 pt-3"
      style="padding-bottom: calc(1rem + env(safe-area-inset-bottom))"
      data-test="night-actions"
    >
      <slot name="actions" />
    </div>
  </section>
</template>
