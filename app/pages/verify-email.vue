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
          Email verified successfully! You can now complete your account setup.
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
          v-if="verificationStatus === 'success'"
          class="verify-email__actions"
        >
          <UIButton @click="navigateTo('/profile/me/setup')">
            Complete Account Setup
          </UIButton>
        </div>

        <div
          v-if="verificationStatus === 'error'"
          class="verify-email__actions"
        >
          <UIButton @click="navigateTo('/register')">
            Back to Registration
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
const verificationStatus = ref<'loading' | 'success' | 'error' | null>('loading')
const errorMessage = ref('')

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
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  padding: 2rem;
}

.verify-email__title {
  text-align: center;
  margin-bottom: 2rem;
  color: var(--color-primary);
}

.verify-email__content {
  text-align: center;
}

.verify-email__actions {
  margin-top: 2rem;
}
</style>
