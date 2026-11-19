<!-- The home page, drawn from site/content/home.yml: a hero over the building, what's on, the
     centenary and how to get involved. Edit the words there, not here. -->
<script setup lang="ts">
const { data: home } = await useAsyncData('site:home', () => queryCollection('home').first())
if (!home.value) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
useSeoMeta({ title: () => home.value?.title, description: () => home.value?.description })
</script>

<template>
  <div v-if="home">
    <section class="relative isolate overflow-hidden bg-neutral-950 text-white">
      <img
        v-if="home.hero.image"
        :src="home.hero.image"
        alt=""
        fetchpriority="high"
        class="absolute inset-0 -z-20 size-full object-cover"
      >
      <div class="absolute inset-0 -z-10 bg-gradient-to-r from-neutral-950/90 via-neutral-950/70 to-neutral-950/30" />
      <UContainer class="py-24 sm:py-32 lg:py-40">
        <div class="max-w-2xl">
          <p
            v-if="home.hero.headline"
            class="nnt-tag mb-6 inline-block -rotate-1 rounded-sm px-3 py-1 text-sm font-semibold uppercase tracking-wide"
          >
            {{ home.hero.headline }}
          </p>
          <h1 class="text-5xl font-bold tracking-tight text-balance sm:text-7xl">
            {{ home.hero.title }}
            <span
              v-if="home.hero.highlight"
              class="nnt-highlight block"
            >{{ home.hero.highlight }}.</span>
          </h1>
          <p class="mt-6 text-lg text-neutral-200 sm:text-xl">
            {{ home.hero.description }}
          </p>
          <div
            v-if="home.hero.links.length"
            class="mt-10 flex flex-wrap gap-4"
          >
            <UButton
              v-for="(l, i) in home.hero.links"
              :key="l.to"
              :to="l.to"
              :label="l.label"
              size="xl"
              :color="i === 0 ? 'primary' : 'neutral'"
              :variant="i === 0 ? 'solid' : 'subtle'"
            />
          </div>
        </div>
      </UContainer>
    </section>

    <UPageSection
      :title="home.whatsOn.title"
      :ui="{ container: 'py-16 sm:py-20 lg:py-24', title: 'text-left', wrapper: 'flex flex-wrap items-end justify-between gap-4' }"
    >
      <template
        v-if="home.whatsOn.link"
        #links
      >
        <UButton
          :to="home.whatsOn.link.to"
          :label="home.whatsOn.link.label"
          variant="link"
          trailing-icon="i-lucide-arrow-right"
        />
      </template>
      <PublicSiteWhatsOn :limit="home.whatsOn.limit" />
    </UPageSection>

    <UContainer
      v-if="home.feature"
      class="pb-16 sm:pb-20 lg:pb-24"
    >
      <UPageCTA
        :title="home.feature.title"
        :description="home.feature.description"
        :links="home.feature.link ? [{ label: home.feature.link.label, to: home.feature.link.to, color: 'neutral', variant: 'solid' }] : []"
        variant="naked"
        class="nnt-feature rounded-lg bg-neutral-950 text-white"
        :ui="{ title: 'text-white text-left', description: 'text-neutral-300 text-left', links: 'justify-start', container: 'items-start' }"
      >
        <template
          v-if="home.feature.headline"
          #top
        >
          <p class="nnt-highlight px-6 pt-10 text-sm font-semibold uppercase tracking-widest sm:px-12">
            {{ home.feature.headline }}
          </p>
        </template>
      </UPageCTA>
    </UContainer>

    <UPageSection
      v-if="home.involved"
      orientation="horizontal"
      :links="home.involved.link ? [{ label: home.involved.link.label, to: home.involved.link.to, color: 'neutral', variant: 'outline' }] : []"
      :description="home.involved.description"
      class="bg-muted"
    >
      <template #title>
        {{ home.involved.title }}
        <span
          v-if="home.involved.highlight"
          class="block text-primary"
        >{{ home.involved.highlight }}</span>
      </template>
      <UPageGrid class="sm:grid-cols-2 lg:grid-cols-2">
        <UPageCard
          v-for="item in home.involved.items"
          :key="item.title"
          :title="item.title"
          :description="item.description"
          :icon="item.icon"
          variant="subtle"
        />
      </UPageGrid>
    </UPageSection>
  </div>
</template>

<style scoped>
/* The New Theatre's yellow, from the centenary logo. Dark text on it, white text never. */
.nnt-tag {
  background: #f6bf35;
  color: #1a1206;
}
.nnt-highlight {
  color: #f6bf35;
}
.nnt-feature {
  background-image: radial-gradient(ellipse at 70% 40%, rgb(246 191 53 / 0.18), transparent 60%), radial-gradient(ellipse at 40% 90%, rgb(148 64 138 / 0.35), transparent 60%);
}
</style>
