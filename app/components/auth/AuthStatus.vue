<template>
  <div class="auth-status">
    <AuthState>
      <template #default="{ loggedIn }">
        <!-- Show user menu when logged in -->
        <AuthUserMenu v-if="loggedIn" />

        <!-- Show login button when logged out -->
        <NuxtLink
          v-else
          to="/login"
          class="auth-status__login-button"
          aria-label="Log in to your account"
        >
          <Icon
            class="auth-status__login-icon"
            name="icon:login"
            size="20"
          />
        </NuxtLink>
      </template>
    </AuthState>
  </div>
</template>

<style scoped>
.auth-status {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
}

.auth-status__login-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
}

.auth-status__login-button:hover,
.auth-status__login-button:focus-within {
  border-color: var(--nnt-orange);
  outline: none;
}

.auth-status__login-icon {
  color: var(--primary-text-color);
  transition: color var(--transition-fast);
}

.auth-status__login-button:hover .auth-status__login-icon,
.auth-status__login-button:focus .auth-status__login-icon {
  color: var(--nnt-orange);
}

/* Mobile adjustments */
@media (max-width: 480px) {
  .auth-status {
    width: 2.25rem;
    height: 2.25rem;
  }
}
</style>
