<script setup lang="ts">
import { saysShowGuidance } from '#shared/utils/content-warnings'
import type { ShowGuidance } from '#shared/utils/content-warnings'

// The show's age guidance and warnings where a booker decides, and again on the booking itself
// (D-102 criterion 4, issue 1330). The show page carries each warning's description and the notes.
defineProps<{
  guidance: ShowGuidance
  slug: string
  heading: string
}>()
</script>

<template>
  <UCard data-test="before-you-book">
    <template #header>
      <h2 class="font-semibold">
        {{ heading }}
      </h2>
    </template>

    <ul class="space-y-1 text-sm">
      <li
        v-for="line in saysShowGuidance(guidance)"
        :key="line"
      >
        {{ line }}
      </li>
    </ul>

    <NuxtLink
      :to="`/shows/${slug}`"
      class="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
    >
      What each warning means, on the show page
    </NuxtLink>
  </UCard>
</template>
