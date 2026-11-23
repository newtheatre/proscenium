// The membership fees layer: prices, charges and refunds through Payments. Its server code is found through the registry.
export default defineNuxtConfig({
  routeRules: {
    // A scheme's fee is set on the scheme's own page; the old Fees addresses lead to the schemes.
    '/console/membership-fees': { redirect: { to: '/admin/modules/membership/schemes', statusCode: 301 } },
    '/admin/modules/membership-fees/prices': { redirect: { to: '/admin/modules/membership/schemes', statusCode: 301 } },
  },
})
