// The membership layer: schemes, memberships, the standing they give and the reference lists a
// scheme checks against. Its server code is found through the registry.
export default defineNuxtConfig({
  routeRules: {
    // Set-up screens are tabs of the module's page in Admin; console staff are sent on to the console's settings window.
    '/console/membership/schemes': { redirect: { to: '/admin/modules/membership/schemes', statusCode: 301 } },
    '/console/membership/schemes/**': { redirect: { to: '/admin/modules/membership/schemes/**', statusCode: 301 } },
    '/console/membership/lists': { redirect: { to: '/admin/modules/membership/lists', statusCode: 301 } },
    '/console/membership/lists/**': { redirect: { to: '/admin/modules/membership/lists/**', statusCode: 301 } },
  },
})
