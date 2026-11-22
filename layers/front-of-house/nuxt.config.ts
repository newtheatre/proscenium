// The front of house layer: the rota, the shift window and the record of the night. Its server code is found through the registry.
export default defineNuxtConfig({
  routeRules: {
    // Set-up screens are tabs of the module's page in Admin; console staff are sent on to the console's settings window.
    '/console/front-of-house/duties': { redirect: { to: '/admin/modules/front-of-house/duties', statusCode: 301 } },
    '/console/front-of-house/rota-templates': { redirect: { to: '/admin/modules/front-of-house/rota-templates', statusCode: 301 } },
    '/console/front-of-house/checklists': { redirect: { to: '/admin/modules/front-of-house/checklists', statusCode: 301 } },
    '/console/front-of-house/emergency-cards': { redirect: { to: '/admin/modules/front-of-house/emergency-cards', statusCode: 301 } },
    // Volunteer hours is about people, so it sits with People.
    '/console/front-of-house/hours': { redirect: { to: '/console/people/volunteer-hours', statusCode: 301 } },
    // Open shifts became a tab of Shifts; old links and emails still land on it.
    '/members/front-of-house/open': { redirect: { to: '/members/front-of-house?view=open', statusCode: 301 } },
  },
})
