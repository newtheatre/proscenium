<!-- A venue's public page (part 6; C-48): its address and a map link, getting here with each space's
     finding-it note beneath, its access features as icons with labels, and what is on there now. -->
<script setup lang="ts">
interface Feature { termId: string, label: string, icon: string | null, note: string | null }
interface Venue {
  id: string
  slug: string
  name: string
  address: { lines: string[], locality: string | null, postcode: string | null, country: string | null }
  location: { latitude: number, longitude: number } | null
  description: string | null
  accessInfo: string | null
  gettingHere: string | null
  access: Feature[]
  spaces: { id: string, slug: string, name: string, description: string | null, findingIt: string | null, accessInfo: string | null, access: Feature[] }[]
}
interface Listing {
  id: string
  slug: string
  title: string
  subtitle: string | null
  summary: string | null
  category: { label: string } | null
  nextStartsAt: number
  lastStartsAt: number
  lastEndsAt: number
  venues: string[]
  poster: { url: string, alt: string, width: number | null, height: number | null } | null
  age: string | null
  hasEffects: boolean
  hasWarnings: boolean
  price: PriceSummaryView | null
}

const { t } = useT()
const { span } = useDates()
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { data } = await useAPI<{ venue: Venue, productions: Listing[] }>(() => `/api/public-site/venues/${encodeURIComponent(slug.value)}`, { key: `public-site:venue:${slug.value}` })
if (!data.value) throw createError({ statusCode: 404, statusMessage: t('public-site.venue.not-found'), fatal: true })
const venue = computed(() => data.value!.venue)
const productions = computed(() => data.value?.productions ?? [])

const addressLines = computed(() => {
  const a = venue.value.address
  return [...a.lines, [a.locality, a.postcode].filter(Boolean).join(' '), a.country].filter(Boolean) as string[]
})
// OpenStreetMap needs no key and sets no cookies; the pin is the venue's own position.
const mapUrl = computed(() => {
  const l = venue.value.location
  if (l) return `https://www.openstreetmap.org/?mlat=${l.latitude}&mlon=${l.longitude}#map=17/${l.latitude}/${l.longitude}`
  return addressLines.value.length ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(addressLines.value.join(', '))}` : null
})
const findings = computed(() => venue.value.spaces.filter(s => s.findingIt))
const spacesWithAccess = computed(() => venue.value.spaces.filter(s => s.access.length || s.accessInfo))
const hasAccess = computed(() => venue.value.access.length > 0 || !!venue.value.accessInfo || spacesWithAccess.value.length > 0)

useSeoMeta({
  title: () => venue.value.name,
  description: () => markdownText(venue.value.description) || addressLines.value.join(', ') || undefined,
})
// The origin is read here, during setup: inside the head callback the request is no longer to hand.
const origin = useRequestURL().origin
useHead(() => ({
  link: [{ key: 'canonical', rel: 'canonical', href: new URL(`/venues/${venue.value.slug}`, origin).toString() }],
}))
</script>

<template>
  <UContainer v-if="data">
    <UPage>
      <UPageHeader :title="venue.name">
        <template #description>
          <address
            v-if="addressLines.length"
            class="not-italic"
          >
            <template
              v-for="(line, i) in addressLines"
              :key="i"
            >
              {{ line }}<br v-if="i < addressLines.length - 1">
            </template>
          </address>
        </template>
        <template
          v-if="mapUrl"
          #links
        >
          <UButton
            :to="mapUrl"
            target="_blank"
            :label="t('public-site.venue.map')"
            icon="i-lucide-map-pin"
            trailing-icon="i-lucide-external-link"
            color="neutral"
            variant="outline"
          />
        </template>
      </UPageHeader>
      <UPageBody class="max-w-3xl space-y-10">
        <MarkdownText
          v-if="venue.description"
          :text="venue.description"
        />

        <section
          v-if="venue.gettingHere || findings.length"
          aria-labelledby="getting-here-heading"
          class="space-y-3"
        >
          <h2
            id="getting-here-heading"
            class="text-lg font-semibold text-highlighted"
          >
            {{ t('public-site.venue.getting-here') }}
          </h2>
          <MarkdownText
            v-if="venue.gettingHere"
            :text="venue.gettingHere"
          />
          <div
            v-for="s in findings"
            :key="s.id"
          >
            <h3 class="font-medium text-highlighted">
              {{ s.name }}
            </h3>
            <MarkdownText
              :text="s.findingIt"
              class="text-muted"
            />
          </div>
        </section>

        <section
          aria-labelledby="access-heading"
          class="space-y-3"
        >
          <h2
            id="access-heading"
            class="text-lg font-semibold text-highlighted"
          >
            {{ t('public-site.venue.access') }}
          </h2>
          <template v-if="hasAccess">
            <PublicSiteAccessFeatures :features="venue.access" />
            <MarkdownText
              v-if="venue.accessInfo"
              :text="venue.accessInfo"
            />
            <div
              v-for="s in spacesWithAccess"
              :key="s.id"
              class="space-y-2"
            >
              <h3 class="font-medium text-highlighted">
                {{ s.name }}
              </h3>
              <PublicSiteAccessFeatures :features="s.access" />
              <MarkdownText
                v-if="s.accessInfo"
                :text="s.accessInfo"
                class="text-muted"
              />
            </div>
          </template>
          <p
            v-else
            class="text-muted"
          >
            {{ t('public-site.venue.no-access') }}
          </p>
        </section>
      </UPageBody>

      <section
        aria-labelledby="venue-on-heading"
        class="pb-12"
      >
        <h2
          id="venue-on-heading"
          class="mb-4 text-lg font-semibold text-highlighted"
        >
          {{ t('public-site.venue.on-here') }}
        </h2>
        <ul
          v-if="productions.length"
          class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
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
              :when="span(p.nextStartsAt, p.lastStartsAt)"
              :details="p.category?.label"
              :age="p.age"
              :effects="p.hasEffects"
              :warnings="p.hasWarnings"
            />
          </li>
        </ul>
        <p
          v-else
          class="text-muted"
        >
          {{ t('public-site.venue.nothing-on') }}
        </p>
      </section>
    </UPage>
  </UContainer>
</template>
