// Replaces a size's recipe. The recipe current when a sale is paid is the one that moves stock.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { recipeInput, setRecipe } from '../../../../stock'

export default defineRoute({ ability: 'bar.stock.manage', rateLimit: 'write', input: recipeInput }, async (event, { input, unit }) => {
  await setRecipe(unit, getRouterParam(event, 'id', { decode: true })!, input)
  return { ok: true }
})
