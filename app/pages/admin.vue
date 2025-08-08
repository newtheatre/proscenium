<template>
  <div>
    <div>
      <div>
        <div>
          <h1>
            Admin Dashboard
          </h1>

          <div>
            <h2>
              Welcome, {{ user?.name || user?.email }}!
            </h2>
            <p>
              You have admin access. Your roles: {{ user?.roles.join(', ') }}
            </p>
          </div>

          <div>
            <div>
              <h3>
                User Management
              </h3>
              <p>
                Manage system users and their roles.
              </p>
            </div>

            <div>
              <h3>
                System Settings
              </h3>
              <p>
                Configure application settings.
              </p>
            </div>

            <div>
              <h3>
                Reports
              </h3>
              <p>
                View system reports and analytics.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script
    lang="ts"
    setup
  >
definePageMeta({
  middleware: [
    'auth',
    (_to, _from) => {
      const { hasRole } = useAuth()
      if (!hasRole('ADMIN')) {
        throw createError({
          statusCode: 403,
          statusMessage: 'Admin access required',
        })
      }
    },
  ],
})

const { user } = useAuth()
</script>
