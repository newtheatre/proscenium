// A headline figure with a chart, for the console home's tests (core.home-figure).
export default {
  label: 'gallery.home-figures.drafts.label',
  ability: 'gallery.sample.view',
  size: 'wide' as const,
  to: '/console/gallery/drafts',
  async read() {
    return {
      value: 13,
      detail: { key: 'gallery.home-figures.drafts.detail', params: { count: 10 } },
      chart: {
        type: 'bar' as const,
        series: [{ key: 'written', label: 'gallery.home-figures.drafts.series' }],
        rows: [{ date: '2027-09-01', values: { written: 4 } }, { date: '2027-09-02', values: { written: 9 } }],
        summary: { key: 'gallery.home-figures.drafts.summary' },
      },
    }
  },
}
