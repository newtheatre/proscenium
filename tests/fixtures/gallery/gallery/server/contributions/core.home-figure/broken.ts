// A figure that fails, which the console home leaves out rather than failing the page.
export default {
  label: 'gallery.home-figures.broken.label',
  ability: 'gallery.sample.view',
  async read(): Promise<never> {
    throw new Error('This figure always fails.')
  },
}
