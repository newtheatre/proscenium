<template>
  <div class="verify-email-container">
    <div class="verify-email">
      <h2 class="verify-email__title">
        Email Verification
      </h2>

      <div class="verify-email__content">
        <AppAlert
          v-if="verificationStatus === 'success'"
          type="success"
        >
          Email verified successfully! You are now logged in and will be redirected to complete your account setup.
        </AppAlert>

        <AppAlert
          v-if="verificationStatus === 'error'"
          type="error"
        >
          {{ errorMessage }}
        </AppAlert>

        <AppAlert v-if="verificationStatus === 'loading'">
          Verifying your email...
        </AppAlert>

        <div
          v-if="verificationStatus === 'error'"
          class="verify-email__actions"
        >
          <UIButton @click="navigateTo('/login')">
            Return to Login
          </UIButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'guest',
})

const route = useRoute()
const { refresh } = useAuth()
const verificationStatus = ref<'loading' | 'success' | 'error' | null>('loading')
const errorMessage = ref('')

// TODO: Consider doing the verification during SSR
onMounted(async () => {
  const token = route.query.token as string

  if (!token) {
    verificationStatus.value = 'error'
    errorMessage.value = 'No verification token provided'
    return
  }

  try {
    await $fetch('/api/auth/email/verify', {
      method: 'POST',
      body: { token },
    })

    verificationStatus.value = 'success'

    // Refresh the auth state to reflect the new login
    await refresh()

    // Redirect to setup page after a short delay
    setTimeout(() => {
      navigateTo('/profile/me/setup')
    }, 2000)
  }
  catch (error: unknown) {
    verificationStatus.value = 'error'
    const errorData = error as { data?: { message?: string } }
    errorMessage.value = errorData?.data?.message || 'Verification failed. The token may be invalid or expired.'
  }
})
</script>

<style scoped>
.verify-email-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 50vh;
  padding: 2rem;
}

.verify-email {
  max-width: 500px;
  width: 100%;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  border: var(--nnt-orange) solid 2px;
}

.verify-email__title {
  text-align: center;
  margin-bottom: 2rem;
  color: var(--primary-text-color);
  font-weight: 600;
}

.verify-email__content {
  text-align: center;
}

.verify-email__actions {
  margin-top: 2rem;
}
</style>
