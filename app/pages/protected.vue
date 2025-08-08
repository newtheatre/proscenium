<template>
  <div class="protected">
    <h2 class="protected__title">
      🛡️ Protected Page
    </h2>

    <div
      v-if="isLoggedIn"
      class="protected__content"
    >
      <p><strong>Welcome!</strong> If you can see this, the page middleware successfully verified your login status.</p>
      <p class="protected__user-info">
        Your User ID: <code class="protected__code">{{ user?.uid }}</code><br>
        Your Email: <code class="protected__code">{{ user?.email || 'Not available' }}</code>
      </p>

      <!-- <hr class="protected__divider">

      <h3 class="protected__subtitle">Fetch Protected API Data</h3>
      <p>Click the button below to fetch data from the <code class="protected__code">/api/protected</code> endpoint using
        <code class="protected__code">useApiFetch</code>, which automatically includes your authentication token.</p>

      <button :disabled="pending" class="protected__button" @click="fetchData">
        <span v-if="pending">⏳ Loading Data...</span>
        <span v-else>Fetch Data from Server</span>
      </button>

      <div v-if="pending" class="protected__message protected__message--loading">
        Fetching data from the protected API...
      </div>
      <div v-else-if="error" class="protected__message protected__message--error">
        <h4 class="protected__message-title">API Error</h4>
        <p>Failed to fetch data:</p>
        <pre class="protected__error-details">{{ formatError(error) }}</pre>
        <p v-if="error.statusCode === 401" class="protected__suggestion">
          Your session might be invalid or expired (401 Unauthorized). Try logging out and back in.
        </p>
      </div>
      <div v-else-if="apiData" class="protected__message protected__message--success">
        <h4 class="protected__message-title">API Response Success</h4>
        <pre class="protected__data">{{ JSON.stringify(apiData, null, 2) }}</pre>
      </div>
      <div v-else-if="fetchAttempted" class="protected__message protected__message--info">
        No data received yet. Click the button to fetch.
      </div> -->
    </div>

    <div
      v-else
      class="protected__message protected__message--unauthorized"
    >
      <p>
        You should not be able to see this page without being logged in. Please <NuxtLink to="/login">login
        </NuxtLink>.
      </p>
    </div>
  </div>
</template>

<script lang="ts" setup>
definePageMeta({
  middleware: ['auth'],
})

const { user, isLoggedIn } = useAuth() // Get user info and login status
</script>

<style scoped>
.protected {
  max-width: 800px;
  margin: 2rem auto;
  padding: 1.5rem;
}

.protected__title {
  margin-bottom: 1.5rem;
  color: var(--success);
  font-weight: 600;
}

.protected__subtitle {
  margin-top: 2rem;
  margin-bottom: 1rem;
  color: var(--success);
}

.protected__content {
  padding: 1.5rem;
  border-radius: 0.5rem;
  background-color: #f8f8f8;
  color: var(--success);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.protected__user-info {
  margin: 1rem 0;
  color: var(--success);
}

.protected__code {
  background-color: #f0f0f0;
  padding: 0.2rem 0.4rem;
  border-radius: 0.25rem;
  font-family: monospace;
}

.protected__divider {
  margin: 1.5rem 0;
  border: 0;
  border-top: 1px solid #e0e0e0;
}

.protected__button {
  background-color: var(--nnt-orange);
  color: white;
  border: none;
  border-radius: 0.25rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 1rem;
}

.protected__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.protected__message {
  margin-top: 1rem;
  padding: 1rem;
  border-radius: 0.25rem;
}

.protected__message--loading {
  background-color: #e8f4fd;
  color: #0277bd;
}

.protected__message--error {
  background-color: #ffebee;
  color: #c62828;
}

.protected__message--success {
  background-color: #e8f5e9;
  color: #2e7d32;
}

.protected__message--info {
  background-color: #f5f5f5;
  color: #616161;
}

.protected__message--unauthorized {
  background-color: #fff3e0;
  color: #e65100;
}

.protected__message-title {
  margin-top: 0;
  margin-bottom: 0.75rem;
}

.protected__error-details,
.protected__data {
  background-color: rgba(0, 0, 0, 0.05);
  padding: 0.75rem;
  border-radius: 0.25rem;
  overflow-x: auto;
  font-family: monospace;
  font-size: 0.9rem;
}

.protected__suggestion {
  font-style: italic;
  margin-top: 0.75rem;
}
</style>
