<template>
  <div>
    <!-- Hero with optional background image -->
    <UPageHero
      :title="page?.title"
      :subtitle="page?.description"
      class="mb-8 relative"
      :class="page?.heroImage ? 'bg-gray-50 dark:bg-gray-800/50' : ''"
    >
      <!-- Background image overlay -->
      <div
        v-if="page?.heroImage"
        class="absolute inset-0 -z-10"
      >
        <img
          :src="page.heroImage"
          :alt="page?.heroImageAlt || page?.title || ''"
          class="w-full h-full object-cover"
        >
        <div class="absolute inset-0 bg-black/50" />
      </div>
    </UPageHero>
    <UContainer>
      <ContentRenderer
        v-if="page?.body"
        :value="page"
        class="prose-none"
      />
    </UContainer>
  </div>
</template>

<script lang="ts" setup>
interface PageWithHero {
  title?: string
  description?: string
  heroImage?: string
  heroImageAlt?: string
  body?: unknown
}

const route = useRoute()

// Fetch content from Nuxt Content
const page = await queryCollection('pages').path('/pages' + route.path).first() as PageWithHero | null

if (!page) {
  // `fatal` renders the full error page; it is also what Nitro logs a stack for,
  // so the log line is cut back to one in server/plugins/error-logging.ts (ADR-0047).
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}
</script>
