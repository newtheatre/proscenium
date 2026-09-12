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

// Every department takes anybody, which is the point the tiles make by all saying the same thing.
const FIELDS = [
  { title: 'Acting', description: 'Audition for anything. No CV, no headshots, no gatekeeping.' },
  { title: 'Backstage and tech', description: 'Build the set, rig the lights, cue the thunder.' },
  { title: 'Front of house', description: 'Welcome the audience, run the bar, learn the building.' },
  { title: 'Design and marketing', description: 'Posters, trailers and socials, so people show up.' },
]

// Joining is a membership, so a signed-out visitor arrives at the page that explains it and a
// member goes straight to their own.
const joinTo = computed(() => (account.value.signedIn ? '/account/membership' : '/get-involved'))
</script>

<template>
  <div>
    <PhotoHero
      src="/images/nnt-front.webp"
      alt="The front of the Nottingham New Theatre on a bright winter day"
      align="start"
      title="A century of first nights."
      description="The country's only entirely student-run theatre. Fourteen shows a term, made from scratch by people who should probably be revising."
    >
      <template #title>
        A century of<br>
        <span class="text-secondary">first nights.</span>
      </template>

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
      :ui="{ container: 'py-12 sm:py-16' }"
      data-test="home-programme"
    >
      <template #header>
        <div class="flex flex-wrap items-baseline justify-between gap-4">
          <h2 class="nnt-headline text-3xl sm:text-4xl">
            On stage this term
          </h2>
          <ULink
            to="/whats-on"
            class="flex items-center gap-1.5 text-sm font-semibold text-primary"
          >
            Full season
            <UIcon
              name="i-lucide-arrow-right"
              class="size-4"
            />
          </ULink>
        </div>
      </template>

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
    <UContainer>
      <div
        class="dark nnt-spotlight px-6 py-12 sm:px-12 sm:py-16"
        data-test="home-centenary"
      >
        <p class="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          The centenary
        </p>
        <h2 class="nnt-headline mt-4 max-w-2xl text-3xl text-highlighted sm:text-4xl">
          100 years. 2,000 shows.<br>
          One creaky building we love.
        </h2>
        <p class="mt-4 max-w-xl text-default">
          From the 1926 Dramatic Society to today's fourteen-show terms, the theatre has been run by
          students the whole way through.
        </p>
        <UButton
          class="mt-8"
          variant="poster"
          size="lg"
          to="/history"
        >
          Our history
        </UButton>
      </div>
    </UContainer>

    <UPageSection
      :ui="{ container: 'py-12 sm:py-16' }"
      data-test="home-get-involved-section"
    >
      <div class="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 class="nnt-headline text-3xl sm:text-4xl">
            No experience necessary.<br>
            <span class="text-primary">Honestly.</span>
          </h2>
          <p class="mt-4 max-w-md text-muted">
            Act, direct, build sets, rig lights, mix sound, run the bar or design the posters. Every
            single person on every single show is a student, and every one of them started by
            turning up.
          </p>
          <UButton
            class="mt-8"
            variant="poster"
            size="lg"
            :to="joinTo"
            data-test="home-join"
          >
            Join the theatre
          </UButton>
        </div>

        <ul class="grid gap-4 sm:grid-cols-2">
          <li
            v-for="field in FIELDS"
            :key="field.title"
            class="nnt-ticket rounded-lg bg-elevated p-5"
          >
            <p class="font-semibold text-highlighted">
              {{ field.title }}
            </p>
            <p class="mt-1 font-mono text-xs uppercase tracking-widest text-muted">
              Admit all
            </p>
            <p class="mt-3 text-sm text-muted">
              {{ field.description }}
            </p>
          </li>
        </ul>
      </div>
    </UPageSection>
  </div>
</template>
