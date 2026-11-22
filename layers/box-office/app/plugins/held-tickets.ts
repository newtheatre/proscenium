// Puts "Tickets held" in the public header (BoxOfficeHeldTickets) while this tab holds a basket.
export default defineNuxtPlugin(() => {
  const items = usePublicHeaderItems()
  if (!items.value.includes('BoxOfficeHeldTickets')) items.value = [...items.value, 'BoxOfficeHeldTickets']
})
