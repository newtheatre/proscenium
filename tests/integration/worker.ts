// The test Worker's entry. Tests call the kit directly; this only has to exist.
export default {
  async fetch() {
    return new Response('proscenium tests')
  },
}
