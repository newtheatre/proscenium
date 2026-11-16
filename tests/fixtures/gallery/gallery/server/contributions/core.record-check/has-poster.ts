// A checklist line on the sample production: its poster. Done for prod-1 only.
export default {
  record: 'gallery.production',
  ability: 'gallery.sample.view',
  order: 10,
  check: async (recordId: string) => ({ done: recordId === 'prod-1', sentence: recordId === 'prod-1' ? 'A poster is set' : 'Add a poster', link: '/console/gallery/shows' }),
}
