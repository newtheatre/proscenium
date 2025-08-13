<template>
  <div>
    <div>
      <div>
        <h1>
          Welcome to New Theatre - Proscenium
        </h1>
        <p>
          Tests for a basic authentication system with role-based access control
        </p>
      </div>

      <div v-if="isLoggedIn">
        <h2>
          User Dashboard
        </h2>
        <div>
          <div>
            <h3>
              Profile Information
            </h3>
            <p><strong>Name:</strong> {{ user?.profile?.name || 'Not provided' }}</p>
            <p><strong>Email:</strong> {{ user?.email }}</p>
            <p><strong>Roles:</strong> {{ user?.roles.join(', ') || 'None' }}</p>
          </div>

          <div>
            <h3>
              Quick Actions
            </h3>
            <div>
              <UIButton @click="testProtectedApi">
                Test Protected API
              </UIButton>
              <UIButton
                v-if="hasRole('ADMIN')"
                @click="testAdminApi"
              >
                Test Admin API
              </UIButton>
              <NuxtLink
                v-if="hasRole('ADMIN')"
                to="/admin"
              >
                Go to Admin Dashboard
              </NuxtLink>
            </div>
          </div>
        </div>

        <div v-if="apiResponse">
          <h4>
            API Response:
          </h4>
          <pre>{{ JSON.stringify(apiResponse, null, 2) }}</pre>
        </div>
      </div>

      <div v-else>
        <h2>
          Get Started
        </h2>
        <p>
          Please log in or create an account to access the application.
        </p>
        <div>
          <NuxtLink to="/login">
            Login
          </NuxtLink>
          <NuxtLink to="/register">
            Register
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script
  lang="ts"
  setup
>
import type { UserResponse } from '../../shared/types/api'

const { user, isLoggedIn, hasRole } = useAuth()
const apiResponse = ref<unknown>(null)

const testProtectedApi = async () => {
  try {
    const response = await $fetch<UserResponse>('/api/users/me')
    apiResponse.value = response
  }
  catch {
    apiResponse.value = { error: 'Failed to fetch protected data' }
  }
}

const testAdminApi = async () => {
  try {
    const response = await $fetch('/api/admin/dashboard')
    apiResponse.value = response
  }
  catch {
    apiResponse.value = { error: 'Failed to fetch admin data' }
  }
}
</script>
