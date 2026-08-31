<script setup lang="ts">
const { account } = useAccount()

useSeoMeta({ title: 'The Nottingham New Theatre' })
</script>

<template>
  <UPageHero
    title="The Nottingham New Theatre"
    description="The country's only entirely student-run theatre."
  >
    <template #links>
      <!-- The one CTA of the view: the budget is one marquee per view. The marketing pages are
           J-110's, so these point at what a member can actually do. -->
      <UButton
        v-if="account.signedIn"
        variant="marquee"
        size="lg"
        to="/rooms"
        data-test="home-rooms"
      >
        Book a room
      </UButton>
      <UButton
        v-else
        variant="marquee"
        size="lg"
        to="/sign-in"
        data-test="home-sign-in"
      >
        Sign in
      </UButton>
      <UButton
        v-if="!account.signedIn"
        variant="poster"
        size="lg"
        to="/register"
      >
        Create an account
      </UButton>
      <UButton
        v-else
        variant="poster"
        size="lg"
        to="/rooms/mine"
      >
        My bookings
      </UButton>
    </template>
  </UPageHero>
</template>
