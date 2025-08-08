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
          class="auth-status__login-link"
        >
          <Icon
            class="auth-status__icon"
            name="icon:login"
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
  width: 2.2rem;
  height: 2.2rem;
  margin: 0;
}

.auth-status__login-link {
  text-decoration: none;
  display: flex;
  align-items: center;
}

.auth-status__icon {
  transition: color 0.2s;
  color: var(--primary-text-color);
}

.auth-status__icon:hover,
.auth-status__icon:focus,
.auth-status__icon:active {
  color: var(--link-color);
}
</style>
