<script setup lang="ts">
import type { ListedShow } from '#shared/utils/programme'

const { account } = useAccount()

useSeoMeta({
  title: 'The Nottingham New Theatre',
  description: 'The country\'s only entirely student-run theatre, at the University of Nottingham: what is on, how to book a ticket, and how to get involved.',
})

// The one page whose title is already the house's name, so the site template would read it twice.
useHead({ titleTemplate: '%s' })

interface Listing { items: ListedShow[] }

// Three shows, not the whole season: the front page is an invitation and what's on is the list.
const { data } = await useFetch<Listing>('/api/whats-on', {
  query: { pageSize: 3 },
  default: (): Listing => ({ items: [] }),
})

const FIELDS = [
  { title: 'Acting', description: 'Audition for anything. No CV, no headshots, no gatekeeping.', icon: 'i-lucide-drama' },
  { title: 'Backstage and tech', description: 'Build the set, rig the lights, cue the thunder.', icon: 'i-lucide-wrench' },
  { title: 'Front of house', description: 'Welcome the audience, run the bar, learn the building.', icon: 'i-lucide-users' },
  { title: 'Design and marketing', description: 'Posters, trailers and socials, so people show up.', icon: 'i-lucide-palette' },
]
</script>

<template>
  <div>
    <PhotoHero
      src="/images/nnt-front.webp"
      alt="The front of the Nottingham New Theatre on a bright winter day"
      title="The Nottingham New Theatre"
      description="The country's only entirely student-run theatre. Written, built and performed by students, every night of the year."
    >
      <template #headline>
        <!-- The view's one sticker. The budget is one each per view, counted by shells.test.ts. -->
        <UBadge
          variant="sticker"
          size="lg"
        >
          1926 to 2026, our centenary season
        </UBadge>
      </template>

      <template #links>
        <!-- The view's one marquee: what a visitor came for, whoever they are. -->
        <UButton
          variant="marquee"
          size="lg"
          to="/whats-on"
          data-test="home-whats-on"
        >
          See what's on
        </UButton>
        <UButton
          v-if="account.signedIn"
          variant="poster"
          size="lg"
          to="/rooms"
          data-test="home-rooms"
        >
          Book a room
        </UButton>
        <UButton
          v-else
          variant="poster"
          size="lg"
          to="/get-involved"
          data-test="home-get-involved"
        >
          Get involved
        </UButton>
      </template>
    </PhotoHero>

    <UPageSection
      title="On stage this term"
      :links="[{ label: 'Full season', to: '/whats-on', trailingIcon: 'i-lucide-arrow-right', variant: 'link', color: 'primary' }]"
      :ui="{ title: 'nnt-headline', container: 'py-12 sm:py-16' }"
      data-test="home-programme"
    >
      <UPageGrid v-if="data.items.length">
        <ShowPosterCard
          v-for="listed in data.items"
          :key="listed.show.slug"
          :listed="listed"
        />
      </UPageGrid>
      <p
        v-else
        class="text-muted"
        data-test="home-programme-empty"
      >
        Nothing is on sale at the moment. The next season is announced here first.
      </p>
    </UPageSection>

    <!-- The view's one spotlight: stage black under a limelight, marked dark so every token in
         the subtree resolves for it (docs/design-language.md, chrome rule 1). -->
    <UPageCTA
      variant="naked"
      class="dark nnt-spotlight"
      title="100 years. One creaky building we love."
      description="From the 1926 Dramatic Society to today's fourteen-show terms, the theatre has been run by students the whole way through."
      :links="[{ label: 'Our history', to: '/history', variant: 'poster', size: 'lg' }]"
      data-test="home-centenary"
    />

    <UPageSection
      title="No experience necessary"
      description="Act, direct, build sets, rig lights, mix sound, run the bar or design the posters. Everybody here started by turning up."
      :features="FIELDS"
      :links="[{ label: 'Get involved', to: '/get-involved', variant: 'poster', size: 'lg' }]"
      :ui="{ title: 'nnt-headline', container: 'py-12 sm:py-16' }"
      data-test="home-get-involved-section"
    />
  </div>
</template>
