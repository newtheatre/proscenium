<!-- The home page, drawn from site/content/home.yml: the building under the scrim with the season's
     sticker, what's on as posters, the centenary in the spotlight, and how to get involved as ticket
     stubs. Edit the words there, not here. -->
<script setup lang="ts">
interface Listing {
  id: string
  slug: string
  title: string
  subtitle: string | null
  summary: string | null
  category: { label: string } | null
  age: string | null
  hasEffects: boolean
  hasWarnings: boolean
  nextStartsAt: number
  lastStartsAt: number
  venues: string[]
  poster: { url: string, alt: string, width: number | null, height: number | null } | null
  price: PriceSummaryView | null
}
const { t } = useT()
const { range } = useDates()
const { data: home } = await useAsyncData('site:home', () => queryCollection('home').first())
if (!home.value) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
useSeoMeta({ title: () => home.value?.title, description: () => home.value?.description })
// The soonest few shows. The section's own link goes to the full list, so the listing has none.
const { data: listing } = await useAPI<{ productions: Listing[] }>('/api/public-site/productions', { key: 'site:home:whats-on', query: { limit: home.value.whatsOn.limit } })
const productions = computed(() => listing.value?.productions ?? [])
</script>

<template>
  <div v-if="home">
    <NntHero
      :src="home.hero.image ?? null"
      :description="home.hero.description"
      align="start"
    >
      <template
        v-if="home.hero.headline"
        #headline
      >
        <span class="nnt-sticker inline-block px-4 py-1.5 text-sm">{{ home.hero.headline }}</span>
      </template>
      <template #title>
        {{ home.hero.title }}<template v-if="home.hero.highlight">
          <br><span class="text-(--color-gold-400)">{{ home.hero.highlight }}.</span>
        </template>
      </template>
      <template
        v-if="home.hero.links?.length"
        #links
      >
        <UButton
          v-for="(l, i) in home.hero.links ?? []"
          :key="l.to"
          :to="l.to"
          :label="l.label"
          size="lg"
          :class="i === 0 ? 'nnt-button-marquee' : 'nnt-button-poster'"
        />
      </template>
    </NntHero>

    <UContainer class="py-12 sm:py-16">
      <div class="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h2 class="nnt-headline text-3xl text-highlighted sm:text-4xl">
          {{ home.whatsOn.title }}
        </h2>
        <ULink
          v-if="home.whatsOn.link"
          :to="home.whatsOn.link.to"
          class="flex items-center gap-1.5 text-sm font-semibold text-primary"
        >
          {{ home.whatsOn.link.label }}
          <UIcon
            name="i-lucide-arrow-right"
            class="size-4"
          />
        </ULink>
      </div>
      <ul
        v-if="productions.length"
        class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
      >
        <li
          v-for="p in productions"
          :key="p.id"
        >
          <PublicSiteShowCard
            :to="`/whats-on/${p.slug}`"
            :title="p.title"
            :description="markdownText(p.summary) || p.subtitle"
            :poster="p.poster"
            :price="p.price"
            :when="range(p.nextStartsAt, p.lastStartsAt)"
            :age="p.age"
            :effects="p.hasEffects"
            :warnings="p.hasWarnings"
            :details="[p.venues.join(', '), p.category?.label].filter(Boolean).join(' · ')"
          />
        </li>
      </ul>
      <p
        v-else
        class="text-muted"
      >
        {{ t('public-site.whats-on.nothing-on-sale') }}
      </p>
    </UContainer>

    <UContainer v-if="home.feature">
      <div class="dark nnt-spotlight rounded-lg px-6 py-12 ring ring-(--color-gold-400)/40 sm:px-12 sm:py-16">
        <p
          v-if="home.feature.headline"
          class="font-mono text-xs tracking-[0.2em] text-(--color-gold-400) uppercase"
        >
          {{ home.feature.headline }}
        </p>
        <h2 class="nnt-headline mt-4 max-w-2xl text-3xl text-highlighted sm:text-4xl">
          {{ home.feature.title }}
        </h2>
        <p class="mt-4 max-w-xl text-default">
          {{ home.feature.description }}
        </p>
        <UButton
          v-if="home.feature.link"
          :to="home.feature.link.to"
          :label="home.feature.link.label"
          size="lg"
          class="nnt-button-poster mt-8"
        />
      </div>
    </UContainer>

    <UContainer
      v-if="home.involved"
      class="py-12 sm:py-16"
    >
      <div class="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 class="nnt-headline text-3xl text-highlighted sm:text-4xl">
            {{ home.involved.title }}<template v-if="home.involved.highlight">
              <br><span class="text-primary">{{ home.involved.highlight }}</span>
            </template>
          </h2>
          <p class="mt-4 max-w-md text-muted">
            {{ home.involved.description }}
          </p>
          <UButton
            v-if="home.involved.link"
            :to="home.involved.link.to"
            :label="home.involved.link.label"
            size="lg"
            class="nnt-button-poster mt-8"
          />
        </div>
        <ul class="grid gap-4 sm:grid-cols-2">
          <li
            v-for="item in home.involved.items"
            :key="item.title"
            class="nnt-ticket rounded-lg bg-elevated p-5"
          >
            <p class="flex items-center gap-2 font-semibold text-highlighted">
              <UIcon
                v-if="item.icon"
                :name="item.icon"
                class="size-4 text-primary"
              />
              {{ item.title }}
            </p>
            <p class="mt-1 font-mono text-xs tracking-widest text-muted uppercase">
              Admit all
            </p>
            <p class="mt-3 text-sm text-muted">
              {{ item.description }}
            </p>
          </li>
        </ul>
      </div>
    </UContainer>
  </div>
</template>
