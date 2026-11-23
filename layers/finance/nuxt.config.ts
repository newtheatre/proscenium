// The finance layer: the ledger. Its server code is found through the registry.
export default defineNuxtConfig({
  routeRules: {
    // Set-up screens are tabs of the module's page in Admin; console staff are sent on to the console's settings window.
    // Export is a button on the Ledger.
    '/console/finance/export': { redirect: { to: '/console/finance/ledger?export=1', statusCode: 301 } },
    '/console/finance/accounts': { redirect: { to: '/admin/modules/finance/accounts', statusCode: 301 } },
  },
})
