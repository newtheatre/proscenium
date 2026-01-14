<template>
  <UContainer class="flex flex-col items-center justify-center gap-4 p-4 min-h-[calc(100vh-var(--ui-header-height))]">
    <UPageCard
      class="w-full max-w-md"
      highlight
      highlight-color="secondary"
    >
      <div class="p-6">
        <UIcon
          :name="iconName"
          :class="['size-16', iconClass]"
        />

        <div class="text-center space-y-2">
          <h1 class="text-2xl font-bold">
            {{ title }}
          </h1>
          <p class="text-muted">
            {{ message }}
          </p>
        </div>

        <UButton
          v-if="showLoginButton"
          label="Go to Login"
          to="/login"
          block
        />
      </div>
    </UPageCard>
  </UContainer>
</template>

<script lang="ts" setup>
definePageMeta({
  title: 'Verify Email',
  description: 'Verify your email address',
})

const route = useRoute()
const { user, fetch: refreshSession } = useUserSession()

const token = route.query.token as string

const { data, error } = await useAsyncData('verify-email', async () => {
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'No verification token provided' })
  }
  return $fetch('/api/auth/email/verify', {
    method: 'POST',
    body: { token },
  })
})

const success = computed(() => !!data.value && !error.value)
const errorMessage = computed(() => (error.value?.data as { message?: string })?.message || '')
const isExpired = computed(() => errorMessage.value.includes('new one has been sent'))
const isAlreadyVerified = computed(() => errorMessage.value.includes('already verified'))

const iconName = computed(() => {
  if (success.value || isAlreadyVerified.value) return 'i-lucide-circle-check'
  return 'i-lucide-circle-x'
})

const iconClass = computed(() => {
  if (success.value || isAlreadyVerified.value) return 'text-success'
  return 'text-error'
})

const title = computed(() => {
  if (success.value) return 'Email Verified!'
  if (isAlreadyVerified.value) return 'Already Verified'
  if (isExpired.value) return 'Link Expired'
  return 'Verification Failed'
})

const message = computed(() => {
  if (success.value) {
    return user.value
      ? 'Your email has been verified. Redirecting...'
      : 'Your email has been verified. You can now log in.'
  }
  if (isAlreadyVerified.value) return 'This email is already verified.'
  if (isExpired.value) return 'We\'ve sent a new verification link to your email.'
  return errorMessage.value || 'Something went wrong. Please try again.'
})

const showLoginButton = computed(() => !user.value && (success.value || isAlreadyVerified.value))

// Handle redirects
if (success.value) {
  await refreshSession()
  setTimeout(() => navigateTo(user.value ? '/' : '/login'), 2000)
}
else if (isAlreadyVerified.value) {
  setTimeout(() => navigateTo(user.value ? '/' : '/login'), 2000)
}
</script>
