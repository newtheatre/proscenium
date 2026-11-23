// The bar layer: products, prices, outlets and the bar's panel in the till. Its server code is found through the registry.
export default defineNuxtConfig({
  routeRules: {
    // Set-up screens are tabs of the module's page in Admin; console staff are sent on to the console's settings window.
    '/console/bar/products': { redirect: { to: '/admin/modules/bar/products', statusCode: 301 } },
    '/console/bar/products/**': { redirect: { to: '/admin/modules/bar/products/**', statusCode: 301 } },
    '/console/bar/price-lists': { redirect: { to: '/admin/modules/bar/outlets#price-lists', statusCode: 301 } },
    '/console/bar/price-lists/**': { redirect: { to: '/admin/modules/bar/outlets/price-lists/**', statusCode: 301 } },
    // Choices are a section of Products, and price lists a section of Outlets.
    '/admin/modules/bar/choices': { redirect: { to: '/admin/modules/bar/products#choices', statusCode: 301 } },
    '/admin/modules/bar/price-lists': { redirect: { to: '/admin/modules/bar/outlets#price-lists', statusCode: 301 } },
    '/admin/modules/bar/price-lists/**': { redirect: { to: '/admin/modules/bar/outlets/price-lists/**', statusCode: 301 } },
    // Deliveries and stocktakes are tabs of Stock.
    '/console/bar/deliveries': { redirect: { to: '/console/bar/stock/deliveries', statusCode: 301 } },
    '/console/bar/deliveries/**': { redirect: { to: '/console/bar/stock/deliveries/**', statusCode: 301 } },
    '/console/bar/stocktakes': { redirect: { to: '/console/bar/stock/stocktakes', statusCode: 301 } },
    '/console/bar/stocktakes/**': { redirect: { to: '/console/bar/stock/stocktakes/**', statusCode: 301 } },
    // Openings are closed from Bar sales.
    '/console/bar/openings': { redirect: { to: '/console/bar/sales', statusCode: 301 } },
    '/console/bar/outlets': { redirect: { to: '/admin/modules/bar/outlets', statusCode: 301 } },
  },
})
