// The membership fees layer: prices, charges and refunds through Payments. Its server code is found through the registry.
export default defineNuxtConfig({
  routeRules: {
    // Fees is a tab of the module's page in Admin; console staff are sent on to the console's settings window.
    '/console/membership-fees': { redirect: { to: '/admin/modules/membership-fees/prices', statusCode: 301 } },
  },
})
