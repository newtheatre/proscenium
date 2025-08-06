// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/content',
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxt/icon',
    '@nuxt/image',
    '@nuxtjs/seo',
    '@prisma/nuxt',
  ],

  devtools: { enabled: true },
  compatibilityDate: '2025-07-15',

  eslint: {
    config: {
      stylistic: true,
    },
  },
})
