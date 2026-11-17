// The payments layer: intents, attempts, the till and refunds. Its server code is found through the registry.
export default defineNuxtConfig({
  routeRules: {
    // Set-up screens are tabs of the module's page in Admin; console staff are sent on to the console's settings window.
    '/console/payments/providers': { redirect: { to: '/admin/modules/payments/providers', statusCode: 301 } },
  },
})
