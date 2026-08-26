<script setup lang="ts">
useSeoMeta({ title: 'The Nottingham New Theatre' })
</script>

<template>
  <UPageHero
    title="The Nottingham New Theatre"
    description="The country's only entirely student-run theatre."
  >
    <template #links>
      <!-- The one CTA of the view. The budget is one marquee per view and this is it. -->
      <UButton
        variant="marquee"
        size="lg"
        to="/whats-on"
      >
        What's on
      </UButton>
      <UButton
        variant="poster"
        size="lg"
        to="/get-involved"
      >
        Get involved
      </UButton>
    </template>
  </UPageHero>
</template>
