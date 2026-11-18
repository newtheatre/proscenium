// The public allergen chart: what each outlet sells, with the till's answers. Not found when allergens
// are off or the theatre does not publish the chart.
import { defineRoute, refuse } from '#kit'
import { allergenChart } from '../../../allergen-chart'

export default defineRoute({ public: true, rateLimit: 'default' }, async () => {
  const chart = await allergenChart()
  if (!chart) refuse('bar.allergens.unpublished', 'There is no allergen chart to show.', { status: 404 })
  return chart!
})
