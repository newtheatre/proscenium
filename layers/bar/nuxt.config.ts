// The bar layer: products, prices, outlets and the bar's panel in the till. Its server code is found through the registry.
export default defineNuxtConfig({
  routeRules: {
    // Set-up screens are tabs of the module's page in Admin; console staff are sent on to the console's settings window.
    '/console/bar/products': { redirect: { to: '/admin/modules/bar/products', statusCode: 301 } },
    '/console/bar/products/**': { redirect: { to: '/admin/modules/bar/products/**', statusCode: 301 } },
    '/console/bar/price-lists': { redirect: { to: '/admin/modules/bar/price-lists', statusCode: 301 } },
    '/console/bar/price-lists/**': { redirect: { to: '/admin/modules/bar/price-lists/**', statusCode: 301 } },
    '/console/bar/outlets': { redirect: { to: '/admin/modules/bar/outlets', statusCode: 301 } },
  },
})
