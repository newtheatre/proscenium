<script setup lang="ts">
import { SAYS_WARNINGS_LINK } from '#shared/utils/content-warnings'

// The show's age guidance and warnings where a booker decides, and again on the booking itself
// (D-102 criterion 4, issue 1330). The lines are the server's; the show page carries the rest.
defineProps<{
  lines: string[]
  // Null once the show is off the public site, so the block never links to a page that 404s.
  slug: string | null
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
        v-for="line in lines"
        :key="line"
      >
        {{ line }}
      </li>
    </ul>

    <NuxtLink
      v-if="slug"
      :to="`/shows/${slug}`"
      class="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
    >
      {{ SAYS_WARNINGS_LINK }}
    </NuxtLink>
  </UCard>
</template>
