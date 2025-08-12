<template>
  <div class="layout">
    <AppHeader />
    <main class="layout__main">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>

<script lang="ts" setup>

</script>

<style scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.layout__main {
  flex: 1;
  padding-top: var(--spacing-lg);
  /* Account for any content that might be hidden behind the sticky header */
  scroll-margin-top: 80px;
}
</style>

<!-- <template>
  <div>
    <nav>
      <div>
        <div>
          <div>
            <NuxtLink to="/">
              Proscenium
            </NuxtLink>
          </div>

          <div>
            <template v-if="isLoggedIn">
              <span>
                Hello, {{ user?.name || user?.email }}
              </span>

              <NuxtLink
                v-if="hasRole('ADMIN')"
                to="/admin"
              >
                Admin
              </NuxtLink>

              <button @click="handleLogout">
                Logout
              </button>
            </template>

            <template v-else>
              <NuxtLink
                to="/login"
              >
                Login
              </NuxtLink>
              <NuxtLink
                to="/register"
              >
                Register
              </NuxtLink>
            </template>
          </div>
        </div>
      </div>
    </nav>

    <main>
      <slot />
    </main>
  </div>
</template>

<script
    lang="ts"
    setup
  >
const { user, isLoggedIn, logout, hasRole } = useAuth()

const handleLogout = async () => {
  await logout()
}
</script> -->
