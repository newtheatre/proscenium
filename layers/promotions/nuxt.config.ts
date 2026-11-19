// The promotions layer: one system for codes, offers and discounts across everything sold. Its
// server code is found through the registry.
export default defineNuxtConfig({
  routeRules: {
    // Box office's promo codes became promotions started by a code.
    '/console/box-office/codes': { redirect: { to: '/console/promotions', statusCode: 301 } },
  },
})
