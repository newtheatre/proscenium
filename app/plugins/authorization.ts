// The client half of the resolver. It reads the account snapshot, not the sealed cookie, because
// authority is resolved from the account row and never read back out of a cookie (0007, 0009).
export default defineNuxtPlugin(() => {
  return {
    provide: {
      authorization: {
        resolveClientUser: async <User extends Record<string, unknown>>(): Promise<User | null> => {
          const viewer = useViewer()
          return (viewer.value ?? null) as unknown as User | null
        },
      },
    },
  }
})
