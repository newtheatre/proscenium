<script setup lang="ts">
import { PRODUCTION_SITE_URL, SITE_NAME } from '#shared/utils/seo'

const { account } = useAccount()

useSeoMeta({
  title: 'The Nottingham New Theatre',
  description: 'The country\'s only entirely student-run theatre, at the University of Nottingham: what is on, how to book a ticket, and how to get involved.',
})

// The organisation, once, on the home page (K-125 criterion 4).
useSchemaOrg([
  defineOrganization({
    '@type': ['Organization', 'PerformingArtsTheater'],
    'name': SITE_NAME,
    'url': PRODUCTION_SITE_URL,
    'logo': '/images/logos/anniversary-grey.png',
    'address': { addressLocality: 'Nottingham', addressCountry: 'GB' },
  }),
])
</script>

<template>
  <UPageHero
    title="The Nottingham New Theatre"
    description="The country's only entirely student-run theatre."
  >
    <template #links>
      <!-- The one CTA of the view: the budget is one marquee per view. These point at what a
           member can actually do; the editorial pages are reachable from the footer. -->
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
