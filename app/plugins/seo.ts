import { SITE_NAME, titleFor } from '#shared/utils/seo'

// One title template for every page (K-125). A function rather than a pattern, so a page whose
// title is already the house's name does not read it twice.
export default defineNuxtPlugin(() => {
  useHead({ titleTemplate: title => titleFor(title, SITE_NAME) })
})
