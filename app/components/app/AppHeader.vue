<template>
  <header class="app-header">
    <nav class="app-header__nav">
      <NuxtLink
        to="/"
        aria-label="Home | The Nottingham New Theatre"
        class="app-header__logo-link"
      >
        <BrandLogo />
      </NuxtLink>
      <div class="app-header__nav-container">
        <ul class="app-header__nav-list">
          <li
            v-for="link in links"
            :key="link.url"
            class="app-header__nav-item"
          >
            <NuxtLink
              :to="link.url"
              class="app-header__nav-link"
            >
              <template v-if="link.button">
                <UIButton :variant="link.variant">
                  {{ link.text }}
                </UIButton>
              </template>
              <template v-else>
                {{ link.text }}
              </template>
            </NuxtLink>
          </li>
        </ul>
        <AuthStatus />
      </div>
    </nav>
  </header>
</template>

<script lang="ts" setup>
const { data } = await useAsyncData('header', () => {
  return queryCollection('header').first()
})

const { links } = data.value || { links: [] }
</script>

<style scoped>
.app-header {
  background-color: var(--header-bg-color);
  border-bottom: 1px solid var(--border-color-light);
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.app-header__nav {
  max-width: var(--page-max-width);
  display: flex;
  padding: 1.2rem var(--spacing-2xl);
  margin: 0 auto;
  justify-content: space-between;
  align-items: center;
  align-self: stretch;
}

.app-header__nav-container {
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
  justify-content: flex-end;
}

.app-header__nav-list {
  list-style: none;
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-md);
  padding: 0;
  align-items: center;
  margin: 0;
}

.app-header__nav-link {
  color: var(--primary-text-color);
}

.app-header__nav-link:hover,
.app-header__nav-link:active,
.app-header__nav-link:focus {
  color: var(--link-color);
  text-decoration: none;
}

.app-header--narrow {
  display: none;
}

/* Mobile responsive styles */
@media (max-width: 768px) {
  .app-header__nav {
    padding: 1rem var(--spacing-lg);
  }

  .app-header--wide {
    display: none;
  }

  .app-header--narrow {
    display: flex;
    flex-direction: column;
  }

  .app-header--narrow .app-header__nav-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

  .app-header--narrow .app-header__icon {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--primary-text-color);
    font-size: 2rem;
  }

  .app-header--narrow .app-header__nav-list {
    display: none;
    flex-direction: column;
    gap: var(--spacing-md);
    padding: 4rem 0;
    width: 100%;
  }

  .app-header--narrow .app-header__nav-list--open {
    display: flex;
  }
}

/* Ensure auth status is properly sized on mobile */
@media (max-width: 480px) {
  .app-header__nav-container {
    gap: var(--spacing-sm);
  }
}
</style>
