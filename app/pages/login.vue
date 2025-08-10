<template>
  <div class="login-container">
    <div class="login">
      <h2 class="login__title">
        Login to New Theatre
      </h2>

      <AppAlert v-if="isLoggedIn">
        <!-- In theory this should never be displayed -->
        You are already logged in. Redirecting...
      </AppAlert>

      <div
        class="login__content"
      >
        <Form
          :error="form.formError.value"
          @submit="form.handleSubmit"
        >
          <FormInput
            id="email"
            :model-value="email.value.value"
            label="Email"
            type="email"
            autocomplete="email"
            placeholder="Enter your email"
            :error="email.error.value"
            :touched="email.touched.value"
            @update:model-value="email.setValue"
            @blur="email.setTouched()"
          />

          <FormInput
            id="password"
            :model-value="password.value.value"
            label="Password"
            type="password"
            autocomplete="current-password"
            placeholder="Enter your password"
            :error="password.error.value"
            :touched="password.touched.value"
            @update:model-value="password.setValue"
            @blur="password.setTouched()"
          />

          <div class="login-form__forgot-password">
            <NuxtLink
              to="/forgot-password"
              class="login-form__link"
            >
              Forgot your password?
            </NuxtLink>
          </div>

          <div class="login-form__actions">
            <FormButton
              type="submit"
              :disabled="form.isSubmitting.value || !form.isValid.value"
            >
              {{ form.isSubmitting.value ? 'Signing in...' : 'Sign In' }}
            </FormButton>

            <LayoutDivider text="or" />

            <UIButton
              type="button"
              variant="ghost"
              :loading="form.isSubmitting.value"
              full-width
              @click="void 0"
            >
              <Icon
                name="icon:google"
                alt="Committee"
                class="login-form__icon"
              />
              Committee? Login with Google SSO
            </UIButton>
          </div>

          <p class="login-form__register">
            Don't have an account?
            <NuxtLink
              to="/register"
              class="login-form__link"
            >Register</NuxtLink>
          </p>
        </Form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { loginSchema } from '~/utils/validation'

definePageMeta({
  middleware: 'guest',
})

const { login, isLoggedIn } = useAuth()

const form = useForm({
  schema: loginSchema,
  initialValues: {
    email: '',
    password: '',
  },
  onSubmit: async (values) => {
    try {
      // Call your authentication API
      await login(values)

      // Redirect on success
      await navigateTo('/')
    }
    catch (error) {
      // Handle errors - display user-friendly error message
      console.error('Login failed:', error)

      // Extract error message for display
      let errorMessage = 'An unexpected error occurred. Please try again.'

      if (error && typeof error === 'object') {
        if ('data' in error && error.data && typeof error.data === 'object' && 'message' in error.data) {
          errorMessage = String(error.data.message)
        }
        else if ('message' in error) {
          errorMessage = String(error.message)
        }
      }

      // Set the form error to display to user
      form.setFormError(errorMessage)
    }
  },
})

// Ensure fields are properly initialized
const email = form.register('email', '')
const password = form.register('password', '')
</script>

<style scoped>
.login-form {
  max-width: 400px;
  margin: 0 auto;
}

.login-form__actions {
  display: flex;
  flex-direction: column;
  margin-bottom: 1.5rem;
}

.login-form__forgot-password {
  text-align: right;
  margin-bottom: 1.5rem;
}

.login-form__icon {
  width: 20px;
  height: 20px;
  margin-right: 0.5rem;
}

.login-form__register {
  text-align: center;
  font-size: 0.875rem;
  color: var(--secondary-text-color);
}

.login-form__link {
  color: var(--nnt-purple);
  text-decoration: none;
  font-weight: 500;
}

.login-form__link:hover {
  text-decoration: underline;
}

.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 50vh;
  padding: 1.5rem;
}

.login {
  width: 100%;
  max-width: 400px;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  border: var(--nnt-orange) solid 2px;
}

.login__title {
  text-align: center;
  margin-bottom: 1.5rem;
  color: var(--primary-text-color);
  font-weight: 600;
}

.login__content {
  width: 100%;
}
</style>
