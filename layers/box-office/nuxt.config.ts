// The box office layer: what is on sale, capacity, orders and tickets. Its server code is found through the registry.
export default defineNuxtConfig({
  routeRules: {
    // Set-up screens are tabs of the module's page in Admin; console staff are sent on to the console's settings window.
    '/console/box-office/ticket-types': { redirect: { to: '/admin/modules/box-office/ticket-types', statusCode: 301 } },
  },
})
